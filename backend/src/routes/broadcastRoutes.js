const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

router.use(authMiddleware);
router.use(profileMiddleware);

// ─── CSV / VCF helpers ────────────────────────────────────────────────────────

function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-\.\(\)]/g, '').replace(/[^\d+]/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (!p.startsWith('+')) p = '+' + p;
  if (p.replace(/\D/g, '').length < 8) return null;
  return p;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const rows = lines.map(l =>
    l.split(delim).map(c => c.trim().replace(/^["']|["']$/g, ''))
  );

  const nameKeys = ['nom', 'name', 'prenom', 'prénom', 'first', 'contact', 'fullname'];
  const phoneKeys = ['telephone', 'téléphone', 'tel', 'phone', 'numero', 'numéro', 'mobile', 'portable', 'whatsapp', 'cell'];

  let nameIdx = -1, phoneIdx = -1;
  let dataRows = rows;

  const header = rows[0].map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const hasHeader = header.some(h => nameKeys.some(k => h.includes(k)) || phoneKeys.some(k => h.includes(k)));

  if (hasHeader) {
    for (let i = 0; i < header.length; i++) {
      if (nameIdx === -1 && nameKeys.some(k => header[i].includes(k))) nameIdx = i;
      if (phoneIdx === -1 && phoneKeys.some(k => header[i].includes(k))) phoneIdx = i;
    }
    dataRows = rows.slice(1);
  } else {
    const col0 = rows[0][0] || '';
    if (/^[+\d]/.test(col0)) { phoneIdx = 0; nameIdx = 1; }
    else { nameIdx = 0; phoneIdx = 1; }
  }

  const contacts = [];
  for (const row of dataRows) {
    const rawPhone = phoneIdx >= 0 ? row[phoneIdx] : row[0];
    const rawName = nameIdx >= 0 ? row[nameIdx] : null;
    const phone = normalizePhone(rawPhone);
    if (phone) contacts.push({ phone, name: rawName?.trim() || null });
  }
  return contacts;
}

function parseVcf(content) {
  const contacts = [];
  const vcards = content.split(/BEGIN:VCARD/i).slice(1);
  for (const vcard of vcards) {
    let name = null;
    const fnMatch = vcard.match(/^FN(?:;[^\r\n:]*)?:([^\r\n]+)/im);
    if (fnMatch) name = fnMatch[1].trim();
    if (!name) {
      const nMatch = vcard.match(/^N(?:;[^\r\n:]*)?:([^\r\n]+)/im);
      if (nMatch) {
        name = nMatch[1].split(';').filter(Boolean).reverse().join(' ').trim() || null;
      }
    }
    const telMatches = [...vcard.matchAll(/^TEL(?:;[^\r\n:]*)?:([^\r\n]+)/gim)];
    for (const m of telMatches) {
      const phone = normalizePhone(m[1].trim());
      if (phone) { contacts.push({ phone, name }); break; }
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
    const { name, messages, contact_ids } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom de campagne requis' });
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'Au moins un message requis' });
    if (!Array.isArray(contact_ids) || contact_ids.length === 0)
      return res.status(400).json({ error: 'Sélectionnez au moins un contact' });

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contact_ids.map(Number) }, profile_id: req.profileId },
      select: { id: true }
    });
    if (contacts.length === 0)
      return res.status(400).json({ error: 'Aucun contact valide sélectionné' });

    const campaign = await prisma.campaign.create({
      data: {
        profile_id: req.profileId,
        name: name.trim(),
        messages: {
          create: messages.map((m, i) => ({
            content: m.content,
            order_index: i,
            delay_after_seconds: m.delay_after_seconds || 0
          }))
        },
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

    let imported = 0, skipped = 0;
    for (const c of parsed) {
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
    res.json({ imported, skipped, total: parsed.length });
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
