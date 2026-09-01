const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
let Webhook = null;
try {
  ({ Webhook } = require('fedapay'));
} catch (_) {
  console.warn('[FedaPay] SDK absent : les paiements resteront indisponibles jusqu’à npm install.');
}
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');
const centralSync = require('../services/centralSync');

const FEDAPAY_API_URL = (process.env.FEDAPAY_API_URL || 'https://api.fedapay.com/v1').replace(/\/$/, '');
const BOTORA_ADMIN_API_URL = (process.env.BOTORA_ADMIN_API_URL || 'https://botora.bluelifetech.site').replace(/\/$/, '');
// Authentification interservices désactivée temporairement en développement.
const MIN_CREDITS = 5;
const XOF_PER_CREDIT = 120;
const TOKENS_PER_CREDIT = 100000;
const APPROVED = 'approved';
const NON_FINAL_STATUSES = new Set(['pending', 'transferred', 'canceled', 'declined', 'deleted']);

function fedapayHeaders() {
  const key = process.env.FEDAPAY_SECRET_KEY;
  if (!key) throw new Error('FEDAPAY_SECRET_KEY non configurée');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function unwrap(data) { return data?.v1 || data?.transaction || data; }
function normalizeStatus(status) { return String(status || 'pending').toLowerCase(); }
function extractId(data) { return String(unwrap(data)?.id || unwrap(data)?.transaction?.id || ''); }
function adminResponsePayload(data) {
  if (!data || typeof data !== 'object') return {};
  return data.data && typeof data.data === 'object' ? data.data : data;
}
function adminResponseStatus(data) {
  const payload = adminResponsePayload(data);
  return payload?.status || payload?.state || payload?.result?.status || payload?.transaction?.status || null;
}
function adminResponseMessage(data) {
  const payload = adminResponsePayload(data);
  return payload?.message || payload?.error || payload?.details || payload?.result?.message || ''; 
}
function callbackUrl() {
  return process.env.FEDAPAY_CALLBACK_URL || `${process.env.APP_URL || 'http://localhost:5173'}/?payment=return`;
}

async function retrieveTransaction(externalId) {
  const response = await axios.get(`${FEDAPAY_API_URL}/transactions/${encodeURIComponent(externalId)}`, { headers: fedapayHeaders(), timeout: 20000 });
  return unwrap(response.data);
}

async function botoraAdminRequest(path, body) {
  const response = await axios.post(`${BOTORA_ADMIN_API_URL}/${path.replace(/^\//, '')}`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 25000
  });
  return response.data;
}

async function creditApprovedPayment(payment, transaction, eventId, eventType, rawPayload) {
  const status = normalizeStatus(transaction?.status);
  await prisma.$transaction(async (tx) => {
    const current = await tx.paymentTransaction.findUnique({ where: { id: payment.id } });
    if (!current) return;
    if (eventId) {
      try {
        await tx.paymentWebhookEvent.create({ data: { payment_id: current.id, event_id: eventId, event_type: eventType, payload: rawPayload } });
      } catch (err) {
        if (err.code === 'P2002') return;
        throw err;
      }
    }
    if (current.status === APPROVED) return;
    await tx.paymentTransaction.update({ where: { id: current.id }, data: { status, last_checked_at: new Date(), ...(status === APPROVED ? { approved_at: new Date() } : {}) } });
    if (status === APPROVED) {
      const account = await tx.account.update({ where: { id: current.account_id }, data: { credit_balance: { increment: current.credits } } });
      await tx.creditTransaction.create({ data: { account_id: current.account_id, amount: current.credits, type: 'purchase', description: `Recharge FedaPay — transaction ${current.external_id}`, created_at: new Date() } });
    }
  });
}

// Webhook is mounted before express.json in server.js, so req.body is a Buffer.
router.post('/webhook', async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.headers['x-fedapay-signature'];
  let event;
  try {
    if (!Webhook) throw new Error('SDK FedaPay absent. Exécutez npm install dans backend.');
    if (!process.env.FEDAPAY_WEBHOOK_SECRET) throw new Error('FEDAPAY_WEBHOOK_SECRET non configurée');
    event = Webhook.constructEvent(raw, signature, process.env.FEDAPAY_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook invalide: ${err.message}` });
  }
  const eventType = String(event?.name || event?.type || '').toLowerCase();
  const payload = event?.object || event?.data || event?.transaction || {};
  const externalId = String(payload?.id || payload?.transaction?.id || '');
  const eventId = String(event?.id || `${eventType}:${externalId}:${payload?.updated_at || payload?.status || Date.now()}`);
  if (!externalId) return res.status(200).json({ received: true });
  try {
    const payment = await prisma.paymentTransaction.findUnique({ where: { external_id: externalId } });
    if (payment) await creditApprovedPayment(payment, payload, eventId, eventType, raw.toString('utf8'));
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[FedaPay] Webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook temporairement indisponible' });
  }
});

router.use(authMiddleware);

router.post('/subscription/checkout', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { id: true, name: true, email: true } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
    const offer = await centralSync.getSubscriptionOffer();
    if (!offer || !Boolean(offer.is_active) || Number(offer.price_xof || 0) <= 0) return res.status(503).json({ error: 'L’offre annuelle est indisponible pour le moment.' });
    const amount = Math.round(Number(offer.price_xof));
    const durationDays = Math.max(1, Number(offer.duration_days || 365));
    const merchantReference = `BOTORA-SUB-${account.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payment = await prisma.subscriptionPayment.create({ data: { account_id: account.id, external_id: merchantReference, amount_xof: amount, duration_days: durationDays, status: 'pending', description: 'Abonnement Botora annuel' } });
    try {
      const created = await centralSync.createSubscription(account.email, callbackUrl());
      const providerId = String(created?.transactionId || '');
      if (!created?.ok || !providerId || !created.paymentUrl) throw new Error(created?.error || 'Réponse de paiement abonnement invalide');
      await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { external_id: providerId, metadata: JSON.stringify({ merchant_reference: merchantReference, admin_payment_id: created.paymentId }) } });
      return res.json({ paymentId: payment.id, transactionId: providerId, paymentUrl: created.paymentUrl, amount: created.amount || amount, duration_days: durationDays });
    } catch (error) {
      await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'creation_failed', metadata: JSON.stringify({ error: error.response?.data || error.message }) } });
      throw error;
    }
  } catch (error) {
    console.error('[Subscription] Checkout error:', error.response?.data || error.message);
    res.status(502).json({ error: error.response?.data?.error || 'Impossible de créer le paiement de l’abonnement.' });
  }
});

router.get('/subscription/transactions', async (req, res) => {
  const rows = await prisma.subscriptionPayment.findMany({ where: { account_id: req.accountId }, orderBy: { created_at: 'desc' }, take: 20 });
  res.json(rows);
});

router.post('/subscription/:id/verify', async (req, res) => {
  const payment = await prisma.subscriptionPayment.findFirst({ where: { id: Number(req.params.id), account_id: req.accountId } });
  if (!payment) return res.status(404).json({ error: 'Paiement abonnement introuvable.' });
  if (payment.status === APPROVED) return res.json({ status: APPROVED, approved: true, alreadyActivated: true });
  try {
    const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { email: true } });
    let metadata = {};
    try { metadata = payment.metadata ? JSON.parse(payment.metadata) : {}; } catch (_) {}
    const result = await centralSync.verifySubscription(account.email, Number(metadata.admin_payment_id || 0), payment.external_id);
    const status = normalizeStatus(result?.status || (result?.approved ? APPROVED : 'pending'));
    await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status, last_checked_at: new Date(), ...(status === APPROVED ? { approved_at: new Date() } : {}) } });
    return res.json({ ...result, status, approved: status === APPROVED });
  } catch (error) {
    console.error('[Subscription] Verify error:', error.response?.data || error.message);
    res.status(502).json({ error: error.response?.data?.error || 'Vérification du paiement d’abonnement temporairement indisponible.' });
  }
});

router.get('/config', async (_req, res) => {
  const central = await centralSync.getCreditConfig();
  const conversion = central || { tokens_per_unit: TOKENS_PER_CREDIT, credits_per_unit: 1, xof_per_unit: XOF_PER_CREDIT, xof_per_credit: XOF_PER_CREDIT };
  res.json({ minCredits: MIN_CREDITS, xofPerCredit: Number(conversion.xof_per_credit || (conversion.xof_per_unit / conversion.credits_per_unit)), tokensPerCredit: Number(conversion.tokens_per_unit / conversion.credits_per_unit), tokensPerUnit: Number(conversion.tokens_per_unit), creditsPerTokenUnit: Number(conversion.credits_per_unit), xofPerTokenUnit: Number(conversion.xof_per_unit), currency: 'XOF', feesNotice: 'Les frais FedaPay, estimés entre 1,5 % et 4 %, restent à votre charge.' });
});

router.post('/checkout', async (req, res) => {
  try {
    const credits = Number(req.body?.credits);
    if (!Number.isFinite(credits) || credits < MIN_CREDITS) return res.status(400).json({ error: `Le minimum est de ${MIN_CREDITS} crédits.` });
    const normalizedCredits = Number(credits.toFixed(10));
    const centralConversion = await centralSync.getCreditConfig();
    const conversion = centralConversion || { tokens_per_unit: TOKENS_PER_CREDIT, credits_per_unit: 1, xof_per_unit: XOF_PER_CREDIT, xof_per_credit: XOF_PER_CREDIT };
    const amount = Math.round(normalizedCredits * Number(conversion.xof_per_credit || (conversion.xof_per_unit / conversion.credits_per_unit)));
    const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { id: true, name: true, email: true } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
    const merchantReference = `BOTORA-${account.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payment = await prisma.paymentTransaction.create({ data: { account_id: account.id, external_id: merchantReference, amount_xof: amount, credits: normalizedCredits, status: 'pending', description: `Recharge de ${normalizedCredits} crédit(s)`, metadata: JSON.stringify({ conversion }) } });
    try {
      const created = await botoraAdminRequest('/api/payment-create.php', { email: account.email, credits: normalizedCredits, callback_url: callbackUrl(), platform_payment_id: String(payment.id) });
      const providerId = String(created.transactionId || '');
      if (!created.ok || !providerId || !created.paymentUrl) throw new Error(created.error || 'Réponse de paiement admin invalide');
      await prisma.paymentTransaction.update({ where: { id: payment.id }, data: { external_id: providerId, metadata: JSON.stringify({ conversion, merchant_reference: merchantReference, admin_payment_id: created.paymentId }) } });
      return res.json({ paymentId: payment.id, transactionId: providerId, paymentUrl: created.paymentUrl, amount: created.amount || amount, credits: normalizedCredits });
    } catch (err) {
      await prisma.paymentTransaction.update({ where: { id: payment.id }, data: { status: 'creation_failed', metadata: JSON.stringify({ error: err.response?.data || err.message }) } });
      throw err;
    }
  } catch (err) {
    console.error('[FedaPay] Checkout error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Impossible de créer le paiement FedaPay. Vérifiez la configuration du compte marchand.' });
  }
});

router.get('/transactions', async (req, res) => {
  const rows = await prisma.paymentTransaction.findMany({ where: { account_id: req.accountId }, orderBy: { created_at: 'desc' }, take: 100 });
  res.json(rows);
});

router.get('/usage', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const allowed = [50, 100, 500, 1000];
  const requested = Number.parseInt(req.query.per_page, 10) || 50;
  const perPage = allowed.includes(requested) ? requested : 50;
  const where = { account_id: req.accountId };
  if (page > 1) await centralSync.syncCreditUsage(req.accountId, page, perPage);
  const [total, usage, aggregate] = await Promise.all([
    prisma.creditUsage.count({ where }),
    prisma.creditUsage.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * perPage, take: perPage }),
    prisma.creditUsage.aggregate({ where, _sum: { tokens_used: true, credits_used: true } })
  ]);
  res.json({ usage, summary: { occurrences: total, tokens_used: Number(aggregate._sum.tokens_used || 0), credits_used: Number(aggregate._sum.credits_used || 0) }, pagination: { page, per_page: perPage, total, pages: Math.max(1, Math.ceil(total / perPage)) } });
});

router.post('/transactions/:id/verify', async (req, res) => {
  const payment = await prisma.paymentTransaction.findFirst({ where: { id: Number(req.params.id), account_id: req.accountId } });
  if (!payment) return res.status(404).json({ error: 'Transaction introuvable.' });
  if (payment.status === APPROVED) return res.json({ status: APPROVED, alreadyCredited: true, credits: payment.credits });
  if (Date.now() - new Date(payment.created_at).getTime() > 24 * 60 * 60 * 1000) return res.status(410).json({ error: 'La vérification manuelle est disponible pendant 24 heures après la transaction.' });
  try {
    const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { email: true } });
    const transactionIdForVerification = payment.metadata ? JSON.parse(payment.metadata).fedapay_transaction_id || payment.external_id : payment.external_id;
    const adminResult = await botoraAdminRequest('/api/payment-verify.php', { email: account.email, transaction_id: transactionIdForVerification });
    const statusValue = adminResponseStatus(adminResult);
    const status = normalizeStatus(statusValue || 'pending');
    const adminMessage = adminResponseMessage(adminResult) || (status === APPROVED ? 'Paiement approuvé : crédits ajoutés.' : `Paiement non approuvé (${status}).`);

    if ((adminResult && adminResult.ok === false) || (adminResult && adminResult.success === false) || (!statusValue && (adminResult?.error || adminResult?.message))) {
      return res.status(502).json({ error: adminMessage || 'La vérification FedaPay est temporairement indisponible.' });
    }

    await creditApprovedPayment(payment, { status }, `manual:${payment.external_id}:${status}`, 'manual.verify', JSON.stringify(adminResult));
    return res.json({ status, approved: status === APPROVED, credits: status === APPROVED ? payment.credits : 0, message: adminMessage });
  } catch (err) {
    const details = err.response?.data || err.message || {};
    const detailMessage = typeof details === 'string' ? details : (details?.error || details?.message || 'La vérification FedaPay est temporairement indisponible.');
    console.error('[FedaPay] Verification error:', details);
    return res.status(502).json({ error: detailMessage });
  }
});

module.exports = router;
