const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

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
          response_delay_seconds: 5
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
    const { bot_name, bot_info, bot_behavior, ia_enabled, response_delay_seconds } = req.body;

    const delaySeconds = response_delay_seconds !== undefined
      ? Math.max(1, Math.min(300, parseInt(response_delay_seconds) || 5))
      : undefined;

    const config = await prisma.botConfig.upsert({
      where: { profile_id: req.profileId },
      create: {
        profile_id: req.profileId,
        bot_name: bot_name || 'Botora',
        bot_info: bot_info || '',
        bot_behavior: bot_behavior || '',
        ia_enabled: ia_enabled !== undefined ? ia_enabled : true,
        response_delay_seconds: delaySeconds ?? 5
      },
      update: {
        bot_name: bot_name !== undefined ? bot_name : undefined,
        bot_info: bot_info !== undefined ? bot_info : undefined,
        bot_behavior: bot_behavior !== undefined ? bot_behavior : undefined,
        ia_enabled: ia_enabled !== undefined ? ia_enabled : undefined,
        response_delay_seconds: delaySeconds !== undefined ? delaySeconds : undefined
      }
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('Erreur PUT bot config:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
  }
});

module.exports = router;
