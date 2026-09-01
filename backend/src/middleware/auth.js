const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const JWT_SECRET = process.env.JWT_SECRET || 'botora-secret-key-change-in-prod';
const prisma = new PrismaClient();
const { normalizeLanguage, translate } = require('../utils/i18n');
const centralSync = require('../services/centralSync');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé - token manquant' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.accountId = decoded.accountId;
    const account = await prisma.account.findUnique({
      where: { id: req.accountId },
      select: { language: true }
    });
    req.language = normalizeLanguage(account?.language);
    const json = res.json.bind(res);
    res.json = (payload) => {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const localized = { ...payload };
        const responseLanguage = res.locals.responseLanguage || req.language;
        if (typeof localized.error === 'string') localized.error = translate(localized.error, responseLanguage);
        if (typeof localized.message === 'string') localized.message = translate(localized.message, responseLanguage);
        return json(localized);
      }
      return json(payload);
    };
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

async function adminMiddleware(req, res, next) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.accountId },
      select: { role: true, email: true }
    });
    if (!account) return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    const central = await centralSync.getAccount(account.email);
    if (!central) return res.status(503).json({ error: 'Vérification des droits administrateur indisponible' });
    const legacyAccess = central.control_center_access === null || central.control_center_access === undefined;
    const allowed = legacyAccess ? account.role === 'admin' : Boolean(central.control_center_access);
    if (!allowed) return res.status(403).json({ error: 'Accès au Centre de contrôle refusé' });
    req.isAdmin = true;
    req.controlCenterAccess = true;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur vérification rôle admin' });
  }
}

module.exports = { authMiddleware, profileMiddleware, adminMiddleware, JWT_SECRET };
