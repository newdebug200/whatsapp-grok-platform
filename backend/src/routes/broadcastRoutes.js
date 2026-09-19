const express = require('express');
const router = express.Router();
const fs = require('fs');
const pathModule = require('path');
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

router.use(authMiddleware);
router.use(profileMiddleware);

// ─── CSV / VCF helpers ────────────────────────────────────────────────────────

/**
 * Normalize any phone string to E.164 (+XXXXXXXXXXX).
 * Handles: spaces, dashes, dots, parentheses, +33(0)6..., 00XX..., tel:// URIs,
 * extensions (ext./x/poste), and various exotic separators.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).trim();

  // Strip tel:// or tel: URI prefix
  p = p.replace(/^tel:\/?\/?/i, '');

  // Strip extension suffixes: " ext 123", " x123", " poste 123", "#123"
  p = p.replace(/[\s,]*(ext\.?|x|poste|p\.?|#)\s*\d+$/i, '');

  // Remove all non-digit characters except leading + (keep + only at start)
  // First, preserve a leading +
  const hasPlus = p.startsWith('+');
  p = p.replace(/[^\d]/g, ''); // strip everything non-digit

  // Handle +CC(0)local — e.g. +33(0)612345 → already stripped by regex above
  // If original had +, restore it
  if (hasPlus) p = '+' + p;

  if (!p) return null;

  // Handle 00CC → +CC
  if (p.startsWith('00')) p = '+' + p.slice(2);
  // If no +, add one (number without country code — best effort)
  else if (!p.startsWith('+')) p = '+' + p;

  // Must have at least 8 digits
  if (p.replace(/\D/g, '').length < 8) return null;

  return p;
}

/**
 * Parse a single CSV field respecting RFC 4180 quoting.
 */
function parseCsvLine(line, delim) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 2; continue; } // escaped quote
        inQuote = false; i++; continue;
      }
      cur += ch; i++;
    } else {
      if (ch === '"') { inQuote = true; i++; continue; }
      if (ch === delim) { fields.push(cur.trim()); cur = ''; i++; continue; }
      cur += ch; i++;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseCsv(raw) {
  // Strip UTF-8 BOM
  const content = raw.replace(/^\uFEFF/, '');

  const lines = content.split(/\r?\n|\r/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter: count occurrences of each candidate in first line
  const candidates = [',', ';', '\t', '|'];
  let delim = ',';
  let maxCount = 0;
  for (const c of candidates) {
    const count = (lines[0].split(c).length - 1);
    if (count > maxCount) { maxCount = count; delim = c; }
  }

  const rows = lines.map(l => parseCsvLine(l, delim));

  const nameKeys = ['nom', 'name', 'prenom', 'prenom', 'first', 'last', 'contact',
    'fullname', 'full name', 'display', 'label', 'personne', 'client'];
  const phoneKeys = ['telephone', 'tel', 'phone', 'numero', 'mobile', 'portable',
    'whatsapp', 'cell', 'gsm', 'fax', 'handphone', 'hp', 'handphone'];

  let nameIdx = -1, phoneIdx = -1;
  let dataRows = rows;

  const header = rows[0].map(h => stripAccents(h.toLowerCase().replace(/[\s_\-]/g, '')));
  const hasHeader = header.some(h => nameKeys.some(k => h.includes(k)) || phoneKeys.some(k => h.includes(k)));

  if (hasHeader) {
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (nameIdx === -1 && nameKeys.some(k => h.includes(k))) nameIdx = i;
      if (phoneIdx === -1 && phoneKeys.some(k => h.includes(k))) phoneIdx = i;
    }
    dataRows = rows.slice(1);
  } else {
    // No header detected: guess by content — first column that looks like a phone
    for (let col = 0; col < (rows[0]?.length || 0); col++) {
      const sample = rows.slice(0, Math.min(5, rows.length)).map(r => r[col] || '');
      const phoneCount = sample.filter(v => /[\d\+]/.test(v) && v.replace(/\D/g, '').length >= 7).length;
      if (phoneCount >= Math.ceil(sample.length / 2)) { phoneIdx = col; nameIdx = col === 0 ? 1 : 0; break; }
    }
    // Fallback: single column
    if (phoneIdx === -1) { phoneIdx = 0; nameIdx = -1; }
  }

  const contacts = [];
  for (const row of dataRows) {
    if (row.length === 0 || row.every(c => !c)) continue;
    const rawPhone = row[phoneIdx] ?? '';
    const rawName = nameIdx >= 0 ? (row[nameIdx] ?? '') : '';
    const phone = normalizePhone(rawPhone);
    if (phone) contacts.push({ phone, name: rawName.trim() || null });
  }
  return contacts;
}

/**
 * Decode Quoted-Printable encoded string.
 */
function decodeQP(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

/**
 * Unfold vCard lines (lines starting with SPACE or TAB are continuations).
 */
function unfoldVcf(content) {
  return content.replace(/\r?\n[ \t]/g, '');
}

/**
 * Extract the value from a vCard property line, handling encoding/charset params.
 * e.g. "TEL;TYPE=CELL;ENCODING=QUOTED-PRINTABLE:=33=36..." → "+336..."
 */
function vcfPropertyValue(paramStr, valueStr) {
  const params = (paramStr || '').toUpperCase();
  let value = valueStr || '';
  if (params.includes('ENCODING=QUOTED-PRINTABLE') || params.includes('ENCODING=QP')) {
    value = decodeQP(value);
  }
  // Strip charset markers
  value = value.replace(/\0/g, '').trim();
  return value;
}

function parseVcf(raw) {
  // Strip UTF-8 BOM and unfold
  const content = unfoldVcf(raw.replace(/^\uFEFF/, ''));

  const contacts = [];
  // Split on BEGIN:VCARD (case-insensitive)
  const vcards = content.split(/BEGIN:VCARD/i).slice(1);

  for (const vcard of vcards) {
    let name = null;
    const phones = [];

    for (const line of vcard.split(/\r?\n|\r/)) {
      if (!line || /^END:VCARD/i.test(line)) continue;

      // Parse property: [group.]PROPERTY[;params]:value
      // Supports: FN, N, TEL, item1.TEL, A.TEL, X-ANDROID-CUSTOM, etc.
      const m = line.match(/^(?:[A-Z0-9_-]+\.)?([A-Z-]+)((?:;[^:]*)*):(.*)$/i);
      if (!m) continue;

      const prop = m[1].toUpperCase();
      const params = m[2];
      const value = vcfPropertyValue(params, m[3]);

      if (prop === 'FN') {
        // Prefer FN (formatted name)
        const v = value.trim();
        if (!name && v) name = v;
      } else if (prop === 'N' && !name) {
        // N:Last;First;Middle;Prefix;Suffix
        const parts = value.split(';').map(p => p.trim()).filter(Boolean);
        // Reverse to get First Last order
        if (parts.length > 1) name = [parts[1], parts[0]].filter(Boolean).join(' ');
        else if (parts.length === 1) name = parts[0];
      } else if (prop === 'TEL' || prop === 'X-PHONENUMBER') {
        const phone = normalizePhone(value);
        if (phone && !phones.includes(phone)) phones.push(phone);
      }
    }

    // Add one entry per valid phone (first one only, to avoid duplicates)
    if (phones.length > 0) {
      contacts.push({ phone: phones[0], name: name || null });
    }
  }
  return contacts;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/broadcast/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { profile_id: req.profileId },
      include: { messages: { orderBy: { order_index: 'asc' } } },
      orderBy: { created_at: 'desc' }
    });
    const result = await Promise.all(campaigns.map(async (c) => {
      const [pending, sent, failed] = await Promise.all([
        prisma.campaignTarget.count({ where: { campaign_id: c.id, status: 'pending' } }),
        prisma.campaignTarget.count({ where: { campaign_id: c.id, status: 'sent' } }),
        prisma.campaignTarget.count({ where: { campaign_id: c.id, status: 'failed' } })
      ]);
      return { ...c, progress: { pending, sent, failed, total: pending + sent + failed } };
    }));
    res.json(result);
  } catch (error) {
    console.error('Erreur GET campaigns:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des campagnes' });
  }
});

// POST /api/broadcast/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const { name, messages, contact_ids, tag_id, select_all, delay_min_seconds, delay_max_seconds, scheduled_at } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom de campagne requis' });
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'Au moins un message requis' });

    const delayMin = Math.max(5, parseInt(delay_min_seconds) || 20);
    const delayMax = Math.max(delayMin, parseInt(delay_max_seconds) || 60);

    let scheduledAtDate = null;
    let campaignStatus = 'draft';
    if (scheduled_at) {
      scheduledAtDate = new Date(scheduled_at);
      if (isNaN(scheduledAtDate.getTime())) return res.status(400).json({ error: 'Date de planification invalide' });
      if (scheduledAtDate <= new Date()) return res.status(400).json({ error: 'La date de planification doit être dans le futur' });
      campaignStatus = 'scheduled';
    }

    let resolvedContactIds = [];

    if (tag_id) {
      // Target contacts by tag
      const tag = await prisma.tag.findFirst({
        where: { id: parseInt(tag_id), profile_id: req.profileId }
      });
      if (!tag) return res.status(404).json({ error: 'Tag introuvable' });

      const tagContacts = await prisma.contactTag.findMany({
        where: { tag_id: tag.id },
        select: { contact_id: true }
      });
      resolvedContactIds = tagContacts.map(t => t.contact_id);
      if (resolvedContactIds.length === 0)
        return res.status(400).json({ error: 'Aucun contact associé à ce tag' });
    } else if (select_all) {
      // Select ALL contacts for this profile — avoids sending thousands of IDs over HTTP
      const allContacts = await prisma.contact.findMany({
        where: { profile_id: req.profileId },
        select: { id: true }
      });
      resolvedContactIds = allContacts.map(c => c.id);
      if (resolvedContactIds.length === 0)
        return res.status(400).json({ error: 'Aucun contact trouvé pour ce profil' });
    } else {
      if (!Array.isArray(contact_ids) || contact_ids.length === 0)
        return res.status(400).json({ error: 'Sélectionnez au moins un contact ou un tag' });
      resolvedContactIds = contact_ids.map(Number);
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: resolvedContactIds }, profile_id: req.profileId },
      select: { id: true }
    });
    if (contacts.length === 0)
      return res.status(400).json({ error: 'Aucun contact valide sélectionné' });

    // Process messages: save any uploaded files to disk before the DB insert
    const uploadsDir = pathModule.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const processedMessages = messages.map((m, i) => {
      const msgData = {
        content: m.content || '',
        order_index: i,
        delay_after_seconds: m.delay_after_seconds || 0
      };
      if (m.media_type) {
        if (m.media_data) {
          // File uploaded from browser — save to disk
          const origName = m.media_filename || 'file';
          const ext = origName.split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
          const filename = `campaign_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
          fs.writeFileSync(pathModule.join(uploadsDir, filename), Buffer.from(m.media_data, 'base64'));
          msgData.media_path = filename;
          msgData.media_type = m.media_type;
        } else if (m.media_url?.trim()) {
          msgData.media_url = m.media_url.trim();
          msgData.media_type = m.media_type;
        }
      }
      return msgData;
    });

    const campaign = await prisma.campaign.create({
      data: {
        profile_id: req.profileId,
        name: name.trim(),
        status: campaignStatus,
        scheduled_at: scheduledAtDate,
        delay_min_seconds: delayMin,
        delay_max_seconds: delayMax,
        ...(tag_id ? { tag_id: parseInt(tag_id) } : {}),
        messages: { create: processedMessages },
        targets: { create: contacts.map(c => ({ contact_id: c.id })) }
      },
      include: {
        messages: { orderBy: { order_index: 'asc' } },
        targets: { include: { contact: { select: { id: true, name: true, phone_number: true } } } }
      }
    });
    res.json(campaign);
  } catch (error) {
    console.error('Erreur POST campaign:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la campagne' });
  }
});

// POST /api/broadcast/import-contacts
router.post('/import-contacts', async (req, res) => {
  try {
    const { content, filename } = req.body;
    if (!content) return res.status(400).json({ error: 'Contenu de fichier manquant' });

    const isVcf = /\.vcf$/i.test(filename || '');
    const parsed = isVcf ? parseVcf(content) : parseCsv(content);

    if (parsed.length === 0)
      return res.status(400).json({ error: 'Aucun contact valide trouvé dans le fichier. Vérifiez le format.' });

    // ── Étape 1 : détecter les numéros sans indicatif pays (format local "0XXXXXXXXX") ──
    // normalizePhone() les retourne sous forme +0XXXXXXX — invalides pour WhatsApp.
    const invalidLocal = [];
    const validParsed = [];
    for (const c of parsed) {
      if (c.phone && /^\+0\d+$/.test(c.phone)) {
        invalidLocal.push(c.phone);
      } else {
        validParsed.push(c);
      }
    }

    // ── Étape 2 : déduplication par numéro (même numéro présent N fois dans le fichier) ──
    const seen = new Set();
    const deduplicated = [];
    for (const c of validParsed) {
      if (!seen.has(c.phone)) {
        seen.add(c.phone);
        deduplicated.push(c);
      }
    }
    const duplicatesRemoved = validParsed.length - deduplicated.length;

    if (deduplicated.length === 0) {
      return res.status(400).json({
        error: 'Aucun contact valide trouvé dans le fichier. Vérifiez le format.',
        invalid_format: invalidLocal.length
      });
    }

    // ── Étape 3 : upsert en base ──
    let imported = 0, skipped = 0;
    for (const c of deduplicated) {
      try {
        await prisma.contact.upsert({
          where: { profile_id_phone_number: { profile_id: req.profileId, phone_number: c.phone } },
          create: { profile_id: req.profileId, phone_number: c.phone, name: c.name || null },
          update: c.name ? { name: c.name } : {}
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    res.json({
      imported,
      skipped,
      duplicates_removed: duplicatesRemoved,
      invalid_format: invalidLocal.length,
      total_in_file: parsed.length,
      total_unique: deduplicated.length,
      ...(invalidLocal.length > 0 ? {
        warning: `${invalidLocal.length} numéro(s) ignoré(s) : format local sans indicatif pays (ex: 0612345678). Ajoutez l'indicatif international (ex: +33612345678).`
      } : {})
    });
  } catch (error) {
    console.error('Erreur import contacts:', error);
    res.status(500).json({ error: "Erreur lors de l'import des contacts" });
  }
});

// GET /api/broadcast/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId },
      include: {
        messages: { orderBy: { order_index: 'asc' } },
        targets: {
          include: { contact: { select: { id: true, name: true, phone_number: true } } },
          orderBy: { id: 'asc' }
        }
      }
    });
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement de la campagne' });
  }
});

// POST /api/broadcast/campaigns/:id/start
router.post('/campaigns/:id/start', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    if (campaign.status === 'running') return res.status(400).json({ error: 'Campagne déjà en cours' });
    if (campaign.status === 'completed') return res.status(400).json({ error: 'Campagne déjà terminée' });
    if (campaign.status === 'paused') {
      await prisma.campaignTarget.updateMany({
        where: { campaign_id: campaign.id, status: 'failed' },
        data: { status: 'pending', error: null }
      });
    }
    whatsappManager.startCampaign(campaign.id, req.profileId);
    res.json({ success: true, message: 'Campagne démarrée' });
  } catch (error) {
    console.error('Erreur start campaign:', error);
    res.status(500).json({ error: 'Erreur lors du démarrage de la campagne' });
  }
});

// POST /api/broadcast/campaigns/:id/stop
router.post('/campaigns/:id/stop', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    await whatsappManager.stopCampaign(campaign.id);
    res.json({ success: true, message: 'Campagne mise en pause' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise en pause' });
  }
});

// PUT /api/broadcast/campaigns/:id/delay
router.put('/campaigns/:id/delay', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    if (campaign.status !== 'paused')
      return res.status(400).json({ error: 'Le délai ne peut être modifié que lorsque la campagne est en pause' });

    const delayMin = Math.max(5, parseInt(req.body.delay_min_seconds) || 20);
    const delayMax = Math.max(delayMin, parseInt(req.body.delay_max_seconds) || 60);

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { delay_min_seconds: delayMin, delay_max_seconds: delayMax }
    });
    res.json({ success: true, delay_min_seconds: updated.delay_min_seconds, delay_max_seconds: updated.delay_max_seconds });
  } catch (error) {
    console.error('Erreur update delay campaign:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du délai' });
  }
});

// DELETE /api/broadcast/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    if (campaign.status === 'running')
      return res.status(400).json({ error: 'Arrêtez la campagne avant de la supprimer' });
    await prisma.campaignTarget.deleteMany({ where: { campaign_id: campaign.id } });
    await prisma.campaignMessage.deleteMany({ where: { campaign_id: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;
