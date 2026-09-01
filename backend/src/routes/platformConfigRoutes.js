const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');
const centralSync = require('../services/centralSync');

// GET /api/platform-config — get all platform config values (auth required, any user)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await prisma.platformConfig.findMany();
    const config = {
      whatsapp_discussions_enabled: 'true', ia_enabled_global: 'true', auto_replies_enabled: 'true',
      faq_enabled: 'true', quick_replies_enabled: 'true', funnel_enabled: 'true',
      sentiments_enabled: 'true', sensitive_keywords_enabled: 'true', campaigns_enabled: 'true',
      stats_enabled: 'true', maintenance_enabled: 'false', verification_triggers_enabled: 'true',
      credits_enabled: 'true', credit_per_1000_tokens: '0.01', tokens_per_credit: '100000', credit_value_xof: '120', credit_cost_xof: '60'
    };
    for (const row of rows) config[row.key] = row.value;
    const featureKeys = ['whatsapp_discussions_enabled','ia_enabled_global','auto_replies_enabled','faq_enabled','quick_replies_enabled','funnel_enabled','sentiments_enabled','sensitive_keywords_enabled','campaigns_enabled','stats_enabled','maintenance_enabled','verification_triggers_enabled','credits_enabled'];
    const centralValues = await Promise.all(featureKeys.map(async key => [key, await centralSync.getFeature(key, config[key] !== 'false')]));
    for (const [key, enabled] of centralValues) config[key] = enabled ? 'true' : 'false';
    const centralCreditConfig = await centralSync.getCreditConfig();
    if (centralCreditConfig) {
      config.tokens_per_credit = String(centralCreditConfig.tokens_per_unit / centralCreditConfig.credits_per_unit);
      config.credits_per_100k_tokens = String(centralCreditConfig.credits_per_unit);
      config.credit_value_xof = String(centralCreditConfig.xof_per_unit);
      config.credit_cost_xof = String(centralCreditConfig.xof_per_credit);
      config.credit_config_updated_at = centralCreditConfig.updated_at || '';
    }
    res.json(config);
  } catch (error) {
    console.error('Erreur GET platform-config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

module.exports = router;
