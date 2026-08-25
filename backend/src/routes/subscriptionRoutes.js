const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Les utilisateurs ne voient que les offres actives et leur ordre de publication.
router.get('/', async (_req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { price: 'asc' }],
    });
    res.json(plans.map(plan => ({
      ...plan,
      features: plan.features ? plan.features.split('\n').map(item => item.trim()).filter(Boolean) : [],
    })));
  } catch (error) {
    console.error('Erreur GET subscriptions:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des abonnements' });
  }
});

module.exports = router;
