const axios = require('axios');
const prisma = require('../prisma');
const ADMIN_API = (process.env.BOTORA_ADMIN_API_URL || 'https://botora.bluelifetech.site').replace(/\/$/, '');
const SERVICE_KEY = process.env.BOTORA_ADMIN_SERVICE_KEY || process.env.BOTORA_API_KEY || '';
let featureCache = { at: 0, values: {} };

async function reportActivity(accountId, eventType, payload = {}, tokensUsed = null, creditsUsed = null) {
  if (!SERVICE_KEY || !accountId || !eventType) return false;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return false;
    await axios.post(`${ADMIN_API}/api/telemetry.php`, { email: account.email, event_type: eventType, payload, tokens_used: tokensUsed, credits_used: creditsUsed }, { headers: { 'X-Botora-Service-Key': SERVICE_KEY, 'Content-Type': 'application/json' }, timeout: 8000 });
    return true;
  } catch (error) {
    console.warn(`[CentralSync] Activité ${eventType} non remontée: ${error.message}`);
    return false;
  }
}

async function getFeature(key, fallback = true) {
  if (!SERVICE_KEY) return fallback;
  try {
    if (Date.now() - featureCache.at > 60000) {
      const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'features' }, headers: { 'X-Botora-Service-Key': SERVICE_KEY }, timeout: 8000 });
      featureCache = { at: Date.now(), values: Object.fromEntries((response.data?.features || []).map(item => [item.feature_key, Boolean(Number(item.enabled))]) ) };
    }
    return featureCache.values[key] === undefined ? fallback : featureCache.values[key];
  } catch (error) {
    console.warn(`[CentralSync] Fonctionnalités indisponibles: ${error.message}`);
    return fallback;
  }
}

module.exports = { reportActivity, getFeature };
