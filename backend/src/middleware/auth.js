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
      where: { id: profileId, account_id: req.accountId },
      include: { account: { select: { is_blocked: true } } }
    });
    if (!profile) {
      return res.status(403).json({ error: 'Profil introuvable ou non autorisé' });
    }
    if (profile.account?.is_blocked) {
      return res.status(403).json({ error: 'Compte bloqué. Contactez l\'administrateur.' });
    }
    req.profileId = profileId;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur vérification profil' });
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.accountId },
      select: { role: true }
    });
    if (!account || account.role !== 'admin') {
      return res.status(403).json({ error: "Accès réservé à l'administrateur" });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur vérification des droits' });
  }
}

module.exports = { authMiddleware, profileMiddleware, adminMiddleware, JWT_SECRET };
