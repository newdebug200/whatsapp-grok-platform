const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

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
          ia_enabled: true
        }
      });
    }

    res.json(config);
  } catch (error) {
    console.error('Erreur GET bot config:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/bot', async (req, res) => {
  try {
    const { bot_name, bot_info, bot_behavior, ia_enabled } = req.body;

    const config = await prisma.botConfig.upsert({
      where: { profile_id: req.profileId },
      create: {
        profile_id: req.profileId,
        bot_name: bot_name || 'Botora',
        bot_info: bot_info || '',
        bot_behavior: bot_behavior || '',
        ia_enabled: ia_enabled !== undefined ? ia_enabled : true
      },
      update: {
        bot_name: bot_name !== undefined ? bot_name : undefined,
        bot_info: bot_info !== undefined ? bot_info : undefined,
        bot_behavior: bot_behavior !== undefined ? bot_behavior : undefined,
        ia_enabled: ia_enabled !== undefined ? ia_enabled : undefined
      }
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('Erreur PUT bot config:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
