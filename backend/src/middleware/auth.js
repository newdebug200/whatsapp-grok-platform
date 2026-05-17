const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'botora-secret-key-change-in-prod';

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé - token manquant' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.accountId = decoded.accountId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

async function profileMiddleware(req, res, next) {
  const profileId = parseInt(req.headers['x-profile-id']);
  if (!profileId || isNaN(profileId)) {
    return res.status(400).json({ error: 'Profil non spécifié (header X-Profile-Id manquant)' });
  }

  try {
    const profile = await prisma.whatsAppProfile.findFirst({
      where: { id: profileId, account_id: req.accountId }
    });
    if (!profile) {
      return res.status(403).json({ error: 'Profil introuvable ou non autorisé' });
    }
    req.profileId = profileId;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur vérification profil' });
  }
}

module.exports = { authMiddleware, profileMiddleware, JWT_SECRET };
