const crypto = require('crypto');
const prisma = require('../prisma');
const centralSync = require('../services/centralSync');

function extractApiKey(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.startsWith('Bearer btr_')) return authorization.slice(7).trim();
  const headerKey = String(req.headers['x-api-key'] || '').trim();
  return headerKey || null;
}

async function apiKeyAuth(req, res, next) {
  const rawKey = extractApiKey(req);
  if (!rawKey || !/^btr_[a-z0-9_\-]{32,}$/i.test(rawKey)) return res.status(401).json({ code: 'API_KEY_REQUIRED', error: 'Clé API manquante ou invalide.' });
  try {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await prisma.apiKey.findFirst({ where: { key_hash: keyHash, revoked_at: null }, include: { account: { select: { id: true, email: true, is_blocked: true } } } });
    if (!apiKey || apiKey.account.is_blocked) return res.status(401).json({ code: 'API_KEY_INVALID', error: 'Clé API invalide ou révoquée.' });
    const central = await centralSync.getAccount(apiKey.account.email);
    if (central && central.access_allowed === false) return res.status(403).json({ code: 'SUBSCRIPTION_REQUIRED', error: 'Votre abonnement est requis pour utiliser l’API.', access_type: central.access_type || 'expired', access_ends_at: central.access_ends_at || null });
    req.apiKey = { id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix };
    req.accountId = apiKey.account.id;
    req.accountEmail = apiKey.account.email;
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { last_used_at: new Date() } }).catch(() => {});
    next();
  } catch (error) {
    console.error('[API key] Authentication error:', error.message);
    res.status(503).json({ code: 'API_AUTH_UNAVAILABLE', error: 'Authentification API temporairement indisponible.' });
  }
}

module.exports = { apiKeyAuth };
