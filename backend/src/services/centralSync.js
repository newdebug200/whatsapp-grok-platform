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
    const body = response.data || {};
    const user = body.user || body.account || (body.id || body.email ? body : null);
    const confirmed = body.ok === true || body.success === true || (response.status >= 200 && response.status < 300);
    return confirmed ? { ...(user || {}), _centralConfirmed: true, password_hash: user?.password_hash || user?.passwordHash || null } : null;
  } catch (error) {
    const status = Number(error.response?.status || 0);
    console.warn(`[CentralSync] Authentification centrale impossible: ${error.message}`);
    return status >= 500 || status === 0 ? { _centralUnavailable: true, _centralStatus: status } : null;
  }
}

async function syncAccount(account) {
  if (!account?.email) return null;
  try {
    const response = await axios.post(`${ADMIN_API}/api/account-sync.php`, { email: account.email, name: account.name, phone: account.phone || null, password: account.password_plain || null }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    const body = response.data || {};
    const user = body.user || body.account || (body.id || body.email ? body : null);
    const confirmed = body.ok === true || body.success === true || (response.status >= 200 && response.status < 300);
    return confirmed ? { ...(user || {}), _centralConfirmed: true, password_hash: user?.password_hash || user?.passwordHash || null } : null;
  } catch (error) {
    const status = Number(error.response?.status || 0);
    console.warn(`[CentralSync] Compte non synchronisé: ${error.message}`);
    return status >= 500 || status === 0 ? { _centralUnavailable: true, _centralStatus: status } : null;
  }
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

async function syncCreditUsage(accountId, page = 1, perPage = 1000) {
  if (!accountId) return false;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return false;
    const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'credit-usage', email: account.email, page, per_page: perPage }, timeout: 15000 });
    const rows = response.data?.usage || [];
    for (const row of rows) {
      let meta = {};
      try { meta = JSON.parse(row.meta || '{}'); } catch (_) {}
      const conversion = meta.conversion || {};
      await prisma.creditUsage.upsert({
        where: { central_id: Number(row.id) },
        update: { account_id: Number(accountId), event_type: String(row.event_type || 'ai.usage'), tokens_used: Number(meta.tokens_used || 0), credits_used: Number(row.credits_used || 0), tokens_per_unit: Number(conversion.tokens_per_unit || 100000), credits_per_unit: Number(conversion.credits_per_unit || 1), xof_per_unit: Number(conversion.xof_per_unit ?? 120), metadata: JSON.stringify(meta.payload || {}) },
        create: { central_id: Number(row.id), account_id: Number(accountId), event_type: String(row.event_type || 'ai.usage'), tokens_used: Number(meta.tokens_used || 0), credits_used: Number(row.credits_used || 0), tokens_per_unit: Number(conversion.tokens_per_unit || 100000), credits_per_unit: Number(conversion.credits_per_unit || 1), xof_per_unit: Number(conversion.xof_per_unit ?? 120), metadata: JSON.stringify(meta.payload || {}) }
      });
    }
    return true;
  } catch (error) { console.warn(`[CentralSync] Usages non synchronisés: ${error.message}`); return false; }
}

async function getCreditConfig() {
  try {
    const response = await axios.get(`${ADMIN_API}/api/admin.php`, { params: { resource: 'credit-config' }, timeout: 8000 });
    return response.data?.credit_config || null;
  } catch (error) {
    console.warn(`[CentralSync] Configuration crédits indisponible: ${error.message}`);
    return null;
  }
}

async function consumeCredits(accountId, tokensUsed, eventType = 'ai.usage', payload = {}) {
  if (!accountId || !tokensUsed) return null;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return null;
    const response = await axios.post(`${ADMIN_API}/api/consume-central.php`, { email: account.email, tokens_used: tokensUsed, event_type: eventType, payload }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    const data = response.data || {};
    if (data.ok && Number(data.consumed) > 0) {
      const conversion = data.conversion || { tokens_per_unit: 100000, credits_per_unit: Number(data.consumed) / (Number(tokensUsed) / 100000), xof_per_unit: 120 };
      const usageData = {
        account_id: Number(accountId), event_type: String(eventType || 'ai.usage'), tokens_used: Number(tokensUsed), credits_used: Number(data.consumed),
        tokens_per_unit: Number(conversion.tokens_per_unit || 100000), credits_per_unit: Number(conversion.credits_per_unit || 1), xof_per_unit: Number(conversion.xof_per_unit ?? 120), metadata: JSON.stringify(payload || {})
      };
      const centralId = Number(data.usage_id || 0);
      const save = centralId > 0
        ? prisma.creditUsage.upsert({ where: { central_id: centralId }, update: usageData, create: { central_id: centralId, ...usageData } })
        : prisma.creditUsage.create({ data: usageData });
      save.catch(error => console.warn(`[CentralSync] Usage local non enregistrée: ${error.message}`));
    }
    return data;
  } catch (error) { console.warn(`[CentralSync] Consommation centrale impossible: ${error.message}`); return null; }
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

async function syncApiKeyEvent(accountId, key, event) {
  if (!accountId || !key?.key_uid || !event) return false;
  try {
    const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
    if (!account?.email) return false;
    await axios.post(`${ADMIN_API}/api/api-key-history.php`, { account_email: account.email, key_uid: key.key_uid, name: key.name || undefined, prefix: key.prefix || undefined, event }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
    return true;
  } catch (error) {
    console.warn(`[CentralSync] Historique clé API non remonté (${event}): ${error.message}`);
    return false;
  }
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

module.exports = { reportActivity, syncAccount, authenticateAccount, getAccount, checkHealth, getCredits, getCreditConfig, syncCreditUsage, consumeCredits, getSubscriptionOffer, createSubscription, verifySubscription, syncApiKeyEvent, getFeature };
