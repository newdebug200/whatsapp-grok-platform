const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const whatsappManager = require('../services/whatsappManager');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

const router = express.Router();
const MAX_BATCH = 100;
const MAX_MEDIA_BYTES = 7 * 1024 * 1024;
const sendLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { ok: false, status: 'rate_limited', error: 'Trop de demandes d’envoi. Réessayez dans une minute.' } });

function normalizeRecipient(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+@(c|g)\.us$/i.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return `${digits}@c.us`;
}

function normalizePhoneNumber(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return { digits, phoneNumber: `+${digits}` };
}

function mediaData(payload) {
  const media = payload?.media && typeof payload.media === 'object' ? payload.media : payload || {};
  const data = media.data || media.base64 || media.content;
  const mimeType = media.mimeType || media.mimetype || media.type;
  if (!data && !mimeType) return null;
  if (!data || !mimeType || typeof data !== 'string' || typeof mimeType !== 'string') {
    const error = new Error('Un média doit contenir data/base64 et mimeType.'); error.status = 400; throw error;
  }
  const cleanData = data.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanData) || cleanData.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3)) {
    const error = new Error('Média invalide ou trop volumineux (maximum 7 Mo).'); error.status = 400; throw error;
  }
  return { data: cleanData, mimeType, filename: String(media.filename || media.fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file', voice: Boolean(media.voice || media.sendAudioAsVoice) };
}

async function resolveProfile(accountId, requestedProfileId) {
  const profileId = requestedProfileId ? Number(requestedProfileId) : null;
  if (profileId) return prisma.whatsAppProfile.findFirst({ where: { id: profileId, account_id: accountId } });
  return prisma.whatsAppProfile.findFirst({ where: { account_id: accountId, is_connected: true }, orderBy: { created_at: 'asc' } });
}

async function sendOne(accountId, payload) {
  const recipient = normalizeRecipient(payload.to || payload.recipient || payload.phone || payload.number);
  if (!recipient) { const error = new Error('Destinataire invalide. Utilisez un numéro international, par exemple 229XXXXXXXX.'); error.status = 400; throw error; }
  const text = payload.message ?? payload.content ?? payload.text ?? '';
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const media = mediaData(payload);
  if (!normalizedText && !media) { const error = new Error('Un message texte ou un média est requis.'); error.status = 400; throw error; }
  const profile = await resolveProfile(accountId, payload.profile_id || payload.profileId);
  if (!profile) { const error = new Error('Aucun profil WhatsApp connecté.'); error.status = 503; throw error; }
  const client = whatsappManager.getClient(profile.id);
  if (!client) { const error = new Error('Le profil WhatsApp n’est pas connecté.'); error.status = 503; throw error; }

  const { MessageMedia } = media ? require('whatsapp-web.js') : { MessageMedia: null };
  let sent;
  let messageType = 'text';
  let savedContent = normalizedText;
  if (media) {
    const messageMedia = new MessageMedia(media.mimeType, media.data, media.filename);
    const options = media.voice ? { sendAudioAsVoice: true } : {};
    sent = await client.sendMessage(recipient, messageMedia, normalizedText ? { ...options, caption: normalizedText } : options);
    messageType = media.mimeType.startsWith('image/') ? 'image' : media.mimeType.startsWith('video/') ? 'video' : media.mimeType.startsWith('audio/') ? (media.voice ? 'ptt' : 'audio') : 'document';
    savedContent = normalizedText || `[${messageType}]`;
  } else {
    sent = await client.sendMessage(recipient, normalizedText);
  }
  whatsappManager.trackBotSentId(sent?.id?._serialized);

  const phone = recipient.replace(/@(c|g)\.us$/i, '');
  let contact = await prisma.contact.findFirst({ where: { profile_id: profile.id, OR: [{ wa_id: recipient }, { phone_number: phone }] } });
  if (!contact) contact = await prisma.contact.create({ data: { profile_id: profile.id, phone_number: phone, wa_id: recipient, name: phone } });
  if (contact.wa_id !== recipient) contact = await prisma.contact.update({ where: { id: contact.id }, data: { wa_id: recipient } });
  const saved = await prisma.message.create({ data: { contact_id: contact.id, content: savedContent, direction: 'sent', type: messageType, unread: false, created_at: new Date() } });
  whatsappManager.addToCache(profile.id, contact.id, 'sent', savedContent);
  return { status: 'sent', message_id: sent?.id?._serialized || String(saved.id), recipient, profile_id: profile.id, type: messageType, local_message_id: saved.id };
}

router.use(sendLimiter);
router.use(apiKeyAuth);

router.post('/messages/send', async (req, res) => {
  try {
    const result = await sendOne(req.accountId, req.body || {});
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, status: 'failed', error: error.message || 'Échec de l’envoi du message.' });
  }
});

router.post('/messages/send-batch', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length) return res.status(400).json({ ok: false, status: 'failed', error: 'Le tableau messages est requis et ne peut pas être vide.' });
  if (messages.length > MAX_BATCH) return res.status(400).json({ ok: false, status: 'failed', error: `Le lot ne peut pas contenir plus de ${MAX_BATCH} messages.` });
  const results = [];
  for (let index = 0; index < messages.length; index += 1) {
    try { results.push({ index, ...(await sendOne(req.accountId, messages[index] || {})) }); }
    catch (error) { results.push({ index, status: 'failed', error: error.message || 'Échec de l’envoi du message.' }); }
  }
  const sent = results.filter(item => item.status === 'sent').length;
  const failed = results.length - sent;
  const status = failed === 0 ? 'completed' : sent === 0 ? 'failed' : 'partial';
  res.status(failed && sent ? 207 : failed ? 400 : 200).json({ ok: failed === 0, status, total: results.length, sent, failed, results });
});

router.post('/whatsapp/check-number', async (req, res) => {
  const normalized = normalizePhoneNumber(req.body?.phone_number || req.body?.phone || req.body?.number);
  if (!normalized) return res.status(400).json({ ok: false, error: 'Numéro invalide. Utilisez un numéro international, par exemple 229XXXXXXXX.' });
  try {
    const profile = await resolveProfile(req.accountId, req.body?.profile_id || req.body?.profileId);
    if (!profile) return res.status(503).json({ ok: false, code: 'WHATSAPP_PROFILE_REQUIRED', error: 'Aucun profil WhatsApp connecté.' });
    const client = whatsappManager.getClient(profile.id);
    if (!client) return res.status(503).json({ ok: false, code: 'WHATSAPP_NOT_CONNECTED', error: 'Le profil WhatsApp n’est pas connecté.' });
    const numberId = await client.getNumberId(normalized.digits);
    res.json({ ok: true, phone_number: normalized.phoneNumber, is_whatsapp: Boolean(numberId), profile_id: profile.id, whatsapp_id: numberId?._serialized || null });
  } catch (error) {
    console.error('[API] Vérification numéro WhatsApp:', error.message);
    res.status(502).json({ ok: false, code: 'WHATSAPP_CHECK_FAILED', error: 'Vérification WhatsApp momentanément indisponible.' });
  }
});

router.post('/whatsapp/check-numbers', async (req, res) => {
  const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  if (!numbers.length) return res.status(400).json({ ok: false, error: 'Le tableau numbers est requis et ne peut pas être vide.' });
  if (numbers.length > MAX_BATCH) return res.status(400).json({ ok: false, error: `La vérification ne peut pas contenir plus de ${MAX_BATCH} numéros.` });
  const profile = await resolveProfile(req.accountId, req.body?.profile_id || req.body?.profileId);
  if (!profile) return res.status(503).json({ ok: false, code: 'WHATSAPP_PROFILE_REQUIRED', error: 'Aucun profil WhatsApp connecté.' });
  const client = whatsappManager.getClient(profile.id);
  if (!client) return res.status(503).json({ ok: false, code: 'WHATSAPP_NOT_CONNECTED', error: 'Le profil WhatsApp n’est pas connecté.' });
  const results = [];
  for (let index = 0; index < numbers.length; index += 1) {
    const normalized = normalizePhoneNumber(numbers[index]);
    if (!normalized) { results.push({ index, phone_number: String(numbers[index] || ''), is_whatsapp: false, status: 'invalid' }); continue; }
    try {
      const numberId = await client.getNumberId(normalized.digits);
      results.push({ index, phone_number: normalized.phoneNumber, is_whatsapp: Boolean(numberId), whatsapp_id: numberId?._serialized || null, status: 'checked' });
    } catch (error) {
      results.push({ index, phone_number: normalized.phoneNumber, is_whatsapp: false, status: 'error', error: 'Vérification indisponible pour ce numéro.' });
    }
  }
  const valid = results.filter(item => item.status === 'checked');
  res.json({ ok: true, profile_id: profile.id, total: results.length, whatsapp: valid.filter(item => item.is_whatsapp).length, not_whatsapp: valid.filter(item => !item.is_whatsapp).length, results });
});

router.get('/messages/health', (_req, res) => res.json({ ok: true, status: 'ready' }));

module.exports = router;
