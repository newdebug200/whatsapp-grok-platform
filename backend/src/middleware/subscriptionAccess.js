const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const centralSync = require('../services/centralSync');
const { JWT_SECRET } = require('./auth');
const { normalizeLanguage, translate } = require('../utils/i18n');

const prisma = new PrismaClient();
const PUBLIC_ACCESS_PATHS = [/^\/auth(?:\/|$)/, /^\/subscriptions(?:\/|$)/, /^\/payments(?:\/|$)/, /^\/central-health(?:\/|$)/, /^\/healthz(?:\/|$)/];

async function subscriptionAccessMiddleware(req, res, next) {
  if (PUBLIC_ACCESS_PATHS.some(pattern => pattern.test(req.path))) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    const account = await prisma.account.findUnique({ where: { id: decoded.accountId }, select: { id: true, email: true, language: true } });
    if (!account?.email) return next();
    const central = await centralSync.getAccount(account.email);
    if (central && central.access_allowed === false) {
      const language = normalizeLanguage(account.language);
      const message = central.access_type === 'suspended'
        ? 'Votre accès est suspendu. Contactez le support.'
        : central.access_type === 'banned'
          ? 'Cette licence a été bannie. Contactez le support.'
          : "Votre période d'essai ou votre abonnement est terminé. Souscrivez pour continuer.";
      return res.status(403).json({ code: 'SUBSCRIPTION_REQUIRED', error: translate(message, language), access_type: central.access_type || 'expired', access_ends_at: central.access_ends_at || null });
    }
  } catch (error) {
    // Une indisponibilité centrale ne doit pas déconnecter tous les utilisateurs.
    console.warn(`[Access] Contrôle central indisponible: ${error.message}`);
  }
  next();
}

module.exports = { subscriptionAccessMiddleware };
