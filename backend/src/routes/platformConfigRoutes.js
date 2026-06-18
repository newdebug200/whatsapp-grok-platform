const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');

// GET /api/platform-config — get all platform config values (auth required, any user)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await prisma.platformConfig.findMany();
    const config = {};
    for (const row of rows) config[row.key] = row.value;
    res.json(config);
  } catch (error) {
    console.error('Erreur GET platform-config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

module.exports = router;
