const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const centralSync = require('../services/centralSync');

router.use(authMiddleware);
router.use(profileMiddleware);

function isUnknownFieldError(err) {
  return err?.constructor?.name === 'PrismaClientValidationError' && err.message.includes('Unknown argument');
}

router.get('/bot', async (req, res) => {
  try {
    let config = await prisma.botConfig.findUnique({ where: { profile_id: req.profileId } });
    if (!config) {
      config = await prisma.botConfig.create({
        data: {
          profile_id: req.profileId,
          bot_name: 'Botora',
          bot_info: '',
          bot_behavior: '',
          ia_enabled: false,
          response_delay_seconds: 5,
          business_hours_enabled: false,
          open_days: '1,2,3,4,5',
          open_time: '09:00',
          close_time: '18:00',
          timezone: 'UTC',
          away_message: '',
          away_once_per_session: true,
          personality: 'professional',
          system_prompt_override: null,
          sentiment_alert: false,
          media_auto_reply: false
        }
      });
    }
    res.json(config);
  } catch (error) {
    console.error('Erreur GET bot config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

router.put('/bot', async (req, res) => {
  try {
    const {
      bot_name, bot_info, bot_behavior, ia_enabled, response_delay_seconds,
      business_hours_enabled, open_days, open_time, close_time, timezone,
      away_message, away_once_per_session,
      personality, system_prompt_override, sentiment_alert, media_auto_reply
    } = req.body;

    const delaySeconds = response_delay_seconds !== undefined
      ? Math.max(1, Math.min(300, parseInt(response_delay_seconds) || 5))
      : undefined;

    const VALID_PERSONALITIES = ['professional', 'friendly', 'commercial', 'support'];

    const data = {
      ...(bot_name !== undefined && { bot_name }),
      ...(bot_info !== undefined && { bot_info }),
      ...(bot_behavior !== undefined && { bot_behavior }),
      ...(ia_enabled !== undefined && { ia_enabled }),
      ...(delaySeconds !== undefined && { response_delay_seconds: delaySeconds }),
      ...(business_hours_enabled !== undefined && { business_hours_enabled }),
      ...(open_days !== undefined && { open_days }),
      ...(open_time !== undefined && { open_time }),
      ...(close_time !== undefined && { close_time }),
      ...(timezone !== undefined && { timezone }),
      ...(away_message !== undefined && { away_message }),
      ...(away_once_per_session !== undefined && { away_once_per_session }),
      ...(personality !== undefined && VALID_PERSONALITIES.includes(personality) && { personality }),
      ...(system_prompt_override !== undefined && { system_prompt_override: system_prompt_override || null }),
      ...(sentiment_alert !== undefined && { sentiment_alert }),
      ...(media_auto_reply !== undefined && { media_auto_reply })
    };

    let config;
    try {
      config = await prisma.botConfig.upsert({
        where: { profile_id: req.profileId },
        create: {
          profile_id: req.profileId,
          bot_name: bot_name || 'Botora',
          bot_info: bot_info || '',
          bot_behavior: bot_behavior || '',
          ia_enabled: ia_enabled !== undefined ? ia_enabled : false,
          response_delay_seconds: delaySeconds ?? 5,
          business_hours_enabled: business_hours_enabled ?? false,
          open_days: open_days || '1,2,3,4,5',
          open_time: open_time || '09:00',
          close_time: close_time || '18:00',
          timezone: timezone || 'UTC',
          away_message: away_message || '',
          away_once_per_session: away_once_per_session ?? true,
          personality: personality || 'professional',
          system_prompt_override: system_prompt_override || null,
          sentiment_alert: sentiment_alert ?? false,
          media_auto_reply: media_auto_reply ?? false
        },
        update: data
      });
    } catch (err) {
      if (isUnknownFieldError(err)) {
        // Fallback without new fields for old DB
        const safeData = { ...data };
        delete safeData.personality;
        delete safeData.system_prompt_override;
        delete safeData.sentiment_alert;
        config = await prisma.botConfig.upsert({
          where: { profile_id: req.profileId },
          create: { profile_id: req.profileId, bot_name: bot_name || 'Botora', bot_info: bot_info || '', bot_behavior: bot_behavior || '', ia_enabled: false, response_delay_seconds: 5 },
          update: safeData
        });
      } else throw err;
    }

    res.json(config);
  } catch (error) {
    console.error('Erreur PUT bot config:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
  }
});

// ── Mots-clés sensibles ────────────────────────────────────────────

// GET /api/config/keywords
router.get('/keywords', async (req, res) => {
  try {
    const keywords = await prisma.sensitiveKeyword.findMany({
      where: { profile_id: req.profileId },
      orderBy: { created_at: 'desc' }
    });
    res.json(keywords);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des mots-clés' });
  }
});

// POST /api/config/keywords
router.post('/keywords', async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'Le mot-clé est requis' });
    const trimmed = keyword.trim().toLowerCase();
    const existing = await prisma.sensitiveKeyword.findFirst({ where: { profile_id: req.profileId, keyword: trimmed } });
    if (existing) return res.status(409).json({ error: 'Ce mot-clé existe déjà' });
    const kw = await prisma.sensitiveKeyword.create({ data: { profile_id: req.profileId, keyword: trimmed, is_active: true } });
    res.status(201).json(kw);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de l'ajout du mot-clé" });
  }
});

// PATCH /api/config/keywords/:id — toggle is_active
router.patch('/keywords/:id', async (req, res) => {
  try {
    const kw = await prisma.sensitiveKeyword.findFirst({ where: { id: parseInt(req.params.id), profile_id: req.profileId } });
    if (!kw) return res.status(404).json({ error: 'Mot-clé introuvable' });
    const { is_active } = req.body;
    const updated = await prisma.sensitiveKeyword.update({
      where: { id: kw.id },
      data: { ...(is_active !== undefined && { is_active }) }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/config/keywords/:id
router.delete('/keywords/:id', async (req, res) => {
  try {
    const kw = await prisma.sensitiveKeyword.findFirst({ where: { id: parseInt(req.params.id), profile_id: req.profileId } });
    if (!kw) return res.status(404).json({ error: 'Mot-clé introuvable' });
    await prisma.sensitiveKeyword.delete({ where: { id: kw.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ── Réponses automatiques par mot-clé ───────────────────────────────

function normalizeKeyword(value) {
  return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

router.get('/keyword-replies', async (req, res) => {
  try {
    await centralSync.getKeywordAutoReplies(req.profileId);
    const rules = await prisma.keywordAutoReply.findMany({ where: { profile_id: req.profileId }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] });
    res.json(rules);
  } catch (error) {
    console.error('Erreur GET keyword replies:', error);
    res.status(500).json({ error: 'Impossible de charger les réponses automatiques.' });
  }
});

router.post('/keyword-replies', async (req, res) => {
  try {
    const keyword = String(req.body?.keyword || '').trim();
    const responseText = String(req.body?.response_text || '').trim();
    const normalized = normalizeKeyword(keyword);
    if (!normalized || keyword.length > 255) return res.status(400).json({ error: 'Le mot-clé est requis et ne peut pas dépasser 255 caractères.' });
    if (!responseText || responseText.length > 4000) return res.status(400).json({ error: 'La réponse est requise et ne peut pas dépasser 4 000 caractères.' });
    const duplicate = await prisma.keywordAutoReply.findFirst({ where: { profile_id: req.profileId, keyword_normalized: normalized } });
    if (duplicate) return res.status(409).json({ error: 'Ce mot-clé existe déjà pour ce profil.' });
    const result = await centralSync.createKeywordAutoReply(req.profileId, { keyword, response_text: responseText, is_active: req.body?.is_active !== false });
    if (!result?.ok || !result.rule?.id) return res.status(502).json({ error: 'La réponse automatique n’a pas pu être enregistrée.' });
    const rule = await prisma.keywordAutoReply.create({ data: { central_id: Number(result.rule.id), profile_id: req.profileId, keyword: result.rule.keyword || keyword, keyword_normalized: normalized, response_text: result.rule.response_text || responseText, is_active: result.rule.is_active !== false, central_updated_at: result.rule.updated_at ? new Date(result.rule.updated_at) : null } });
    res.status(201).json(rule);
  } catch (error) {
    console.error('Erreur POST keyword replies:', error);
    const status = error.response?.status === 409 ? 409 : 500;
    res.status(status).json({ error: status === 409 ? 'Ce mot-clé existe déjà pour ce profil.' : 'Impossible d’enregistrer la réponse automatique.' });
  }
});

router.patch('/keyword-replies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.keywordAutoReply.findFirst({ where: { id, profile_id: req.profileId } });
    if (!existing) return res.status(404).json({ error: 'Réponse automatique introuvable.' });
    const keyword = req.body?.keyword !== undefined ? String(req.body.keyword).trim() : existing.keyword;
    const responseText = req.body?.response_text !== undefined ? String(req.body.response_text).trim() : existing.response_text;
    const normalized = normalizeKeyword(keyword);
    if (!normalized || keyword.length > 255) return res.status(400).json({ error: 'Le mot-clé est requis et ne peut pas dépasser 255 caractères.' });
    if (!responseText || responseText.length > 4000) return res.status(400).json({ error: 'La réponse est requise et ne peut pas dépasser 4 000 caractères.' });
    const duplicate = await prisma.keywordAutoReply.findFirst({ where: { profile_id: req.profileId, keyword_normalized: normalized, NOT: { id } } });
    if (duplicate) return res.status(409).json({ error: 'Ce mot-clé existe déjà pour ce profil.' });
    const result = await centralSync.updateKeywordAutoReply(req.profileId, { id: existing.central_id, keyword, response_text: responseText, is_active: req.body?.is_active !== undefined ? Boolean(req.body.is_active) : existing.is_active });
    if (!result?.ok) return res.status(502).json({ error: 'La réponse automatique n’a pas pu être mise à jour.' });
    const rule = await prisma.keywordAutoReply.update({ where: { id }, data: { keyword, keyword_normalized: normalized, response_text: responseText, is_active: req.body?.is_active !== undefined ? Boolean(req.body.is_active) : existing.is_active, central_updated_at: new Date() } });
    res.json(rule);
  } catch (error) {
    console.error('Erreur PATCH keyword replies:', error);
    const status = error.response?.status === 409 ? 409 : 500;
    res.status(status).json({ error: status === 409 ? 'Ce mot-clé existe déjà pour ce profil.' : 'Impossible de mettre à jour la réponse automatique.' });
  }
});

router.delete('/keyword-replies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.keywordAutoReply.findFirst({ where: { id, profile_id: req.profileId } });
    if (!existing) return res.status(404).json({ error: 'Réponse automatique introuvable.' });
    const result = await centralSync.deleteKeywordAutoReply(req.profileId, existing.central_id);
    if (!result?.ok) return res.status(502).json({ error: 'La réponse automatique n’a pas pu être supprimée.' });
    await prisma.keywordAutoReply.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE keyword replies:', error);
    res.status(500).json({ error: 'Impossible de supprimer la réponse automatique.' });
  }
});

// ── Journal des alertes sensibles ──────────────────────────────────

// GET /api/config/flags
router.get('/flags', async (req, res) => {
  try {
    const flags = await prisma.sensitiveFlag.findMany({
      where: { profile_id: req.profileId },
      include: {
        contact: { select: { id: true, name: true, phone_number: true, ia_paused: true, sensitive_flagged: true } }
      },
      orderBy: { flagged_at: 'desc' },
      take: 200
    });
    res.json(flags);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement du journal' });
  }
});

module.exports = router;
