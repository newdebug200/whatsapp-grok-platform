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

const FEDAPAY_API_URL = (process.env.FEDAPAY_API_URL || 'https://api.fedapay.com/v1').replace(/\/$/, '');
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
function callbackUrl() {
  return process.env.FEDAPAY_CALLBACK_URL || `${process.env.APP_URL || 'http://localhost:5173'}/?payment=return`;
}

async function retrieveTransaction(externalId) {
  const response = await axios.get(`${FEDAPAY_API_URL}/transactions/${encodeURIComponent(externalId)}`, { headers: fedapayHeaders(), timeout: 20000 });
  return unwrap(response.data);
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

router.get('/config', (_req, res) => res.json({ minCredits: MIN_CREDITS, xofPerCredit: XOF_PER_CREDIT, tokensPerCredit: TOKENS_PER_CREDIT, currency: 'XOF', feesNotice: 'Les frais FedaPay, estimés entre 1,5 % et 4 %, restent à la charge du client.' }));

router.post('/checkout', async (req, res) => {
  try {
    const credits = Number(req.body?.credits);
    if (!Number.isFinite(credits) || credits < MIN_CREDITS) return res.status(400).json({ error: `Le minimum est de ${MIN_CREDITS} crédits.` });
    const normalizedCredits = Number(credits.toFixed(10));
    const amount = Math.round(normalizedCredits * XOF_PER_CREDIT);
    const account = await prisma.account.findUnique({ where: { id: req.accountId }, select: { id: true, name: true, email: true } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
    const externalId = `BOTORA-${account.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payment = await prisma.paymentTransaction.create({ data: { account_id: account.id, external_id: externalId, amount_xof: amount, credits: normalizedCredits, status: 'pending', description: `Recharge de ${normalizedCredits} crédit(s)` } });
    try {
      const created = await axios.post(`${FEDAPAY_API_URL}/transactions`, { description: payment.description, amount, currency: { iso: 'XOF' }, callback_url: callbackUrl(), custom_metadata: { botora_payment_id: String(payment.id), account_id: String(account.id), credits: String(normalizedCredits) }, customer: { firstname: account.name || 'Client', lastname: 'Botora', email: account.email } }, { headers: fedapayHeaders(), timeout: 20000 });
      const providerTransaction = unwrap(created.data);
      const providerId = extractId(created.data);
      if (!providerId) throw new Error('Identifiant FedaPay absent');
      const tokenResponse = await axios.post(`${FEDAPAY_API_URL}/transactions/${providerId}/token`, {}, { headers: fedapayHeaders(), timeout: 20000 });
      const token = tokenResponse.data?.token || tokenResponse.data?.payment_token;
      if (!token) throw new Error('Lien de paiement FedaPay absent');
      await prisma.paymentTransaction.update({ where: { id: payment.id }, data: { external_id: providerId, metadata: JSON.stringify({ merchant_reference: externalId, providerTransaction }) } });
      return res.json({ paymentId: payment.id, transactionId: providerId, paymentUrl: `https://checkout.fedapay.com/${token}`, amount, credits: normalizedCredits });
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

router.post('/transactions/:id/verify', async (req, res) => {
  const payment = await prisma.paymentTransaction.findFirst({ where: { id: Number(req.params.id), account_id: req.accountId } });
  if (!payment) return res.status(404).json({ error: 'Transaction introuvable.' });
  if (payment.status === APPROVED) return res.json({ status: APPROVED, alreadyCredited: true, credits: payment.credits });
  if (Date.now() - new Date(payment.created_at).getTime() > 24 * 60 * 60 * 1000) return res.status(410).json({ error: 'La vérification manuelle est disponible pendant 24 heures après la transaction.' });
  try {
    const transaction = await retrieveTransaction(payment.external_id);
    const status = normalizeStatus(transaction.status);
    await creditApprovedPayment(payment, transaction, `manual:${payment.external_id}:${status}`, 'manual.verify', JSON.stringify(transaction));
    return res.json({ status, approved: status === APPROVED, credits: status === APPROVED ? payment.credits : 0, message: status === APPROVED ? 'Paiement approuvé : crédits ajoutés.' : `Paiement non approuvé (${status}).` });
  } catch (err) {
    console.error('[FedaPay] Verification error:', err.response?.data || err.message);
    return res.status(502).json({ error: 'La vérification FedaPay est temporairement indisponible.' });
  }
});

module.exports = router;
