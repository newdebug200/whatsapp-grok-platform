const axios = require('axios');
const prisma = require('../prisma');
const ADMIN_API = (process.env.BOTORA_ADMIN_API_URL || 'https://botora.bluelifetech.site').replace(/\/$/, '');
let featureCache = { at: 0, values: {} };

async function reportActivity(accountId, eventType, payload = {}, tokensUsed = null, creditsUsed = null) {
  if (!accountId || !eventType) return false;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return false;
    await axios.post(`${ADMIN_API}/api/telemetry.php`, { email: account.email, event_type: eventType, payload, tokens_used: tokensUsed, credits_used: creditsUsed }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
    return true;
  } catch (error) {
    console.warn(`[CentralSync] Activité ${eventType} non remontée: ${error.message}`);
    return false;
  }
}

async function authenticateAccount(email, password) {
  if (!email || !password) return null;
  try {
    const response = await axios.post(`${ADMIN_API}/api/user-login.php`, { email, password }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data?.user || null;
  } catch (error) { console.warn(`[CentralSync] Authentification centrale impossible: ${error.message}`); return null; }
}

async function syncAccount(account) {
  if (!account?.email) return null;
  try {
    const response = await axios.post(`${ADMIN_API}/api/account-sync.php`, { email: account.email, name: account.name, phone: account.phone || null, password: account.password_plain || null }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data?.user || null;
  } catch (error) { console.warn(`[CentralSync] Compte non synchronisé: ${error.message}`); return null; }
}

async function getAccount(email) {
  if (!email) return null;
  try {
    const response = await axios.get(`${ADMIN_API}/api/account.php`, { params: { email }, timeout: 8000 });
    return response.data?.user || null;
  } catch (error) {
    console.warn(`[CentralSync] Profil central indisponible: ${error.message}`);
    return null;
  }
}

async function checkHealth() {
  try {
    const response = await axios.get(`${ADMIN_API}/api/health.php`, { timeout: 8000 });
    return response.data || { ok: response.status >= 200 && response.status < 300 };
  } catch (error) {
    return { ok: false, status: error.response?.status || 0, error: error.response?.data?.error || error.message };
  }
}

async function getCredits(accountId) {
  if (!accountId) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return null;
    const response = await axios.post(`${ADMIN_API}/api/credits.php`, { email: account.email }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
    return response.data || null;
  } catch (error) { console.warn(`[CentralSync] Solde central indisponible: ${error.message}`); return null; }
}

async function consumeCredits(accountId, tokensUsed, eventType = 'ai.usage', payload = {}) {
  if (!accountId || !tokensUsed) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return null;
    const response = await axios.post(`${ADMIN_API}/api/consume-central.php`, { email: account.email, tokens_used: tokensUsed, event_type: eventType, payload }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data;
  } catch (error) { console.warn(`[CentralSync] Consommation centrale impossible: ${error.message}`); return null; }
}

async function getPlans() {
  try { const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'plans' }, timeout: 8000 }); return response.data?.plans || []; }
  catch (error) { console.warn(`[CentralSync] Abonnements centraux indisponibles: ${error.message}`); return []; }
}

async function getSubscriptionOffer() {
  try {
    const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'subscription' }, timeout: 8000 });
    return response.data?.subscription || null;
  } catch (error) { console.warn(`[CentralSync] Offre annuelle indisponible: ${error.message}`); return null; }
}

async function createSubscription(email, callbackUrl) {
  const response = await axios.post(`${ADMIN_API}/api/subscription-create.php`, { email, callback_url: callbackUrl }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
  return response.data || null;
}

async function verifySubscription(email, paymentId, transactionId) {
  const response = await axios.post(`${ADMIN_API}/api/subscription-verify.php`, { email, payment_id: paymentId, transaction_id: transactionId }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
  return response.data || null;
}

async function getFeature(key, fallback = true) {
  try {
    if (Date.now() - featureCache.at > 60000) {
      const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'features' }, timeout: 8000 });
      featureCache = { at: Date.now(), values: Object.fromEntries((response.data?.features || []).map(item => [item.feature_key, Boolean(Number(item.enabled))]) ) };
    }
    return featureCache.values[key] === undefined ? fallback : featureCache.values[key];
  } catch (error) {
    console.warn(`[CentralSync] Fonctionnalités indisponibles: ${error.message}`);
    return fallback;
  }
}

module.exports = { reportActivity, syncAccount, authenticateAccount, getAccount, checkHealth, getCredits, consumeCredits, getPlans, getSubscriptionOffer, createSubscription, verifySubscription, getFeature };
