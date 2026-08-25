const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');

// GET /api/platform-config — get all platform config values (auth required, any user)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await prisma.platformConfig.findMany();
    const config = {
      whatsapp_discussions_enabled: 'true', ia_enabled_global: 'true', auto_replies_enabled: 'true',
      faq_enabled: 'true', quick_replies_enabled: 'true', funnel_enabled: 'true',
      sentiments_enabled: 'true', sensitive_keywords_enabled: 'true', campaigns_enabled: 'true',
      stats_enabled: 'true', maintenance_enabled: 'false', verification_triggers_enabled: 'true',
      credits_enabled: 'true'
    };
    for (const row of rows) config[row.key] = row.value;
    res.json(config);
  } catch (error) {
    console.error('Erreur GET platform-config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

module.exports = router;
