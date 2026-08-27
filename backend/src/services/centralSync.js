const axios = require('axios');
const prisma = require('../prisma');
const ADMIN_API = (process.env.BOTORA_ADMIN_API_URL || 'https://botora.bluelifetech.site').replace(/\/$/, '');
// Clé publique de développement uniquement ; remplacer via .env en production.
const SERVICE_KEY = process.env.BOTORA_ADMIN_SERVICE_KEY || process.env.BOTORA_SERVICE_KEY || process.env.BOTORA_API_KEY || '4458322a84f6c7ec80d592c2edb193e0bd70f715c79270d5ef2abcab6a45c69a';
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

async function authenticateAccount(email, password) {
  if (!SERVICE_KEY || !email || !password) return null;
  try {
    const response = await axios.post(`${ADMIN_API}/api/user-login.php`, { email, password }, { headers: { 'X-Botora-Service-Key': SERVICE_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data?.user || null;
  } catch (error) { console.warn(`[CentralSync] Authentification centrale impossible: ${error.message}`); return null; }
}

async function syncAccount(account) {
  if (!SERVICE_KEY || !account?.email) return null;
  try {
    const response = await axios.post(`${ADMIN_API}/api/account-sync.php`, { email: account.email, name: account.name, phone: account.phone || null, password_hash: account.password || null }, { headers: { 'X-Botora-Service-Key': SERVICE_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data?.user || null;
  } catch (error) { console.warn(`[CentralSync] Compte non synchronisé: ${error.message}`); return null; }
}

async function getCredits(accountId) {
  if (!SERVICE_KEY || !accountId) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return null;
    const response = await axios.post(`${ADMIN_API}/api/credits.php`, { email: account.email }, { headers: { 'X-Botora-Service-Key': SERVICE_KEY, 'Content-Type': 'application/json' }, timeout: 8000 });
    return response.data || null;
  } catch (error) { console.warn(`[CentralSync] Solde central indisponible: ${error.message}`); return null; }
}

async function consumeCredits(accountId, tokensUsed, eventType = 'ai.usage', payload = {}) {
  if (!SERVICE_KEY || !accountId || !tokensUsed) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return null;
    const response = await axios.post(`${ADMIN_API}/api/consume-central.php`, { email: account.email, tokens_used: tokensUsed, event_type: eventType, payload }, { headers: { 'X-Botora-Service-Key': SERVICE_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data;
  } catch (error) { console.warn(`[CentralSync] Consommation centrale impossible: ${error.message}`); return null; }
}

async function getPlans() {
  if (!SERVICE_KEY) return [];
  try { const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'plans' }, headers: { 'X-Botora-Service-Key': SERVICE_KEY }, timeout: 8000 }); return response.data?.plans || []; }
  catch (error) { console.warn(`[CentralSync] Abonnements centraux indisponibles: ${error.message}`); return []; }
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

module.exports = { reportActivity, syncAccount, authenticateAccount, getCredits, consumeCredits, getPlans, getFeature };
