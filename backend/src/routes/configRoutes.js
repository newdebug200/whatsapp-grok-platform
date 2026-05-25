const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

function isUnknownFieldError(err) {
  return err?.constructor?.name === 'PrismaClientValidationError' &&
    err.message.includes('Unknown argument');
}

router.get('/bot', async (req, res) => {
  try {
    let config = await prisma.botConfig.findUnique({
      where: { profile_id: req.profileId }
    });
    if (!config) {
      config = await prisma.botConfig.create({
        data: {
          profile_id: req.profileId,
          bot_name: 'Botora',
          bot_info: '',
          bot_behavior: '',
          ia_enabled: true,
          response_delay_seconds: 5,
          business_hours_enabled: false,
          open_days: '1,2,3,4,5',
          open_time: '09:00',
          close_time: '18:00',
          timezone: 'UTC',
          away_message: '',
          away_once_per_session: true
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
      away_message, away_once_per_session
    } = req.body;

    const delaySeconds = response_delay_seconds !== undefined
      ? Math.max(1, Math.min(300, parseInt(response_delay_seconds) || 5))
      : undefined;

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
      ...(away_once_per_session !== undefined && { away_once_per_session })
    };

    const config = await prisma.botConfig.upsert({
      where: { profile_id: req.profileId },
      create: {
        profile_id: req.profileId,
        bot_name: bot_name || 'Botora',
        bot_info: bot_info || '',
        bot_behavior: bot_behavior || '',
        ia_enabled: ia_enabled !== undefined ? ia_enabled : true,
        response_delay_seconds: delaySeconds ?? 5,
        business_hours_enabled: business_hours_enabled ?? false,
        open_days: open_days || '1,2,3,4,5',
        open_time: open_time || '09:00',
        close_time: close_time || '18:00',
        timezone: timezone || 'UTC',
        away_message: away_message || '',
        away_once_per_session: away_once_per_session !== undefined ? away_once_per_session : true
      },
      update: data
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('Erreur PUT bot config:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
  }
});

// ── Sensitive Keywords ──

router.get('/keywords', async (req, res) => {
  try {
    const keywords = await prisma.sensitiveKeyword.findMany({
      where: { profile_id: req.profileId },
      orderBy: { created_at: 'asc' }
    });
    res.json(keywords);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement mots-clés' });
  }
});

router.post('/keywords', async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword?.trim()) return res.status(400).json({ error: 'Mot-clé requis' });
    const created = await prisma.sensitiveKeyword.create({
      data: { profile_id: req.profileId, keyword: keyword.trim(), is_active: true }
    });
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création mot-clé' });
  }
});

router.patch('/keywords/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const kw = await prisma.sensitiveKeyword.findFirst({ where: { id, profile_id: req.profileId } });
    if (!kw) return res.status(404).json({ error: 'Mot-clé introuvable' });
    const updates = {};
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (req.body.keyword !== undefined) updates.keyword = req.body.keyword.trim();
    const updated = await prisma.sensitiveKeyword.update({ where: { id }, data: updates });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour mot-clé' });
  }
});

router.delete('/keywords/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const kw = await prisma.sensitiveKeyword.findFirst({ where: { id, profile_id: req.profileId } });
    if (!kw) return res.status(404).json({ error: 'Mot-clé introuvable' });
    await prisma.sensitiveKeyword.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression mot-clé' });
  }
});

// ── Sensitive Flags Journal ──

router.get('/flags', async (req, res) => {
  try {
    const flags = await prisma.sensitiveFlag.findMany({
      where: { profile_id: req.profileId },
      orderBy: { flagged_at: 'desc' },
      take: 200,
      include: {
        contact: { select: { phone_number: true, name: true, ia_paused: true, sensitive_flagged: true } }
      }
    });
    res.json(flags);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement journal' });
  }
});

module.exports = router;
