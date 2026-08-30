const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');
const centralSync = require('../services/centralSync');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { email: true } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
    const [offer, central] = await Promise.all([centralSync.getSubscriptionOffer(), centralSync.getAccount(account.email)]);
    if (!offer) return res.status(503).json({ error: 'L’offre annuelle est momentanément indisponible.' });
    const access = central ? {
      access_allowed: Boolean(central.access_allowed),
      access_type: central.access_type || 'none',
      access_ends_at: central.access_ends_at || null,
      trial_ends_at: central.trial_ends_at || null,
      subscription_ends_at: central.subscription_ends_at || null,
      trial_days_left: central.trial_days_left ?? null,
      subscription_days_left: central.subscription_days_left ?? null
    } : { access_allowed: true, access_type: 'unknown', access_ends_at: null };
    res.json({
      offer: {
        id: 'annual', name: 'Botora annuel', price: Number(offer.price_xof || 0), currency: 'XOF',
        duration_days: Number(offer.duration_days || 365), is_active: Boolean(offer.is_active)
      },
      access
    });
  } catch (error) {
    console.error('Erreur GET subscription:', error);
    res.status(502).json({ error: 'L’offre annuelle est momentanément indisponible.' });
  }
});

module.exports = router;
