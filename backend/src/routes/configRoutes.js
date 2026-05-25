const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

// Helper: check if a Prisma error is about an unknown field
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
      // Try with new field first; fall back if migration not yet applied
      try {
        config = await prisma.botConfig.create({
          data: {
            profile_id: req.profileId,
            bot_name: 'Botora',
            bot_info: '',
            bot_behavior: '',
            ia_enabled: true,
            response_delay_seconds: 5
          }
        });
      } catch (createErr) {
        if (isUnknownFieldError(createErr)) {
          config = await prisma.botConfig.create({
            data: {
              profile_id: req.profileId,
              bot_name: 'Botora',
              bot_info: '',
              bot_behavior: '',
              ia_enabled: true
            }
          });
        } else {
          throw createErr;
        }
      }
    }
    res.json(config);
  } catch (error) {
    console.error('Erreur GET bot config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

router.put('/bot', async (req, res) => {
  try {
    const { bot_name, bot_info, bot_behavior, ia_enabled, response_delay_seconds } = req.body;

    const delaySeconds = response_delay_seconds !== undefined
      ? Math.max(1, Math.min(300, parseInt(response_delay_seconds) || 5))
      : undefined;

    const baseCreate = {
      profile_id: req.profileId,
      bot_name: bot_name || 'Botora',
      bot_info: bot_info || '',
      bot_behavior: bot_behavior || '',
      ia_enabled: ia_enabled !== undefined ? ia_enabled : true
    };
    const baseUpdate = {
      bot_name: bot_name !== undefined ? bot_name : undefined,
      bot_info: bot_info !== undefined ? bot_info : undefined,
      bot_behavior: bot_behavior !== undefined ? bot_behavior : undefined,
      ia_enabled: ia_enabled !== undefined ? ia_enabled : undefined
    };

    let config;
    try {
      // Try with response_delay_seconds (requires migration)
      config = await prisma.botConfig.upsert({
        where: { profile_id: req.profileId },
        create: { ...baseCreate, response_delay_seconds: delaySeconds ?? 5 },
        update: { ...baseUpdate, response_delay_seconds: delaySeconds !== undefined ? delaySeconds : undefined }
      });
    } catch (upsertErr) {
      if (isUnknownFieldError(upsertErr)) {
        // Migration not yet applied — save without the delay field
        console.warn('[config] response_delay_seconds non disponible — migration Prisma requise. Sauvegarde sans ce champ.');
        config = await prisma.botConfig.upsert({
          where: { profile_id: req.profileId },
          create: baseCreate,
          update: baseUpdate
        });
      } else {
        throw upsertErr;
      }
    }

    res.json({ success: true, config, migrationRequired: !config.response_delay_seconds });
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
