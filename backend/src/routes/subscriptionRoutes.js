const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');
const centralSync = require('../services/centralSync');

router.use(authMiddleware);

// Les utilisateurs ne voient que les offres actives et leur ordre de publication.
router.get('/', async (_req, res) => {
  try {
    const plans = await centralSync.getPlans();
    if (!plans.length) return res.status(503).json({ error: 'Les abonnements centraux sont momentanément indisponibles.' });
    res.json(plans.filter(plan => Number(plan.is_active) === 1).map(plan => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      price: Number(plan.price_xof ?? 0),
      currency: 'XOF',
      credits: Number(plan.credits_per_month || 0),
      max_profiles: Number(plan.max_profiles || 1),
      trial_days: Number(plan.trial_days || 0),
      features: [plan.ia_enabled ? 'Bot IA' : null, plan.campaigns_enabled ? 'Campagnes' : null].filter(Boolean),
      is_active: true,
    })));
  } catch (error) {
    console.error('Erreur GET subscriptions centrales:', error);
    res.status(502).json({ error: 'API centrale des abonnements indisponible.' });
  }
});

module.exports = router;
