const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const pathModule = require('path');
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

// ── Audio conversion helper (WebM → OGG Opus) ─────────────────────────────────
async function convertWebmToOgg(base64Data) {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    const ffmpeg = require('fluent-ffmpeg');
    const tmpIn  = pathModule.join(os.tmpdir(), `wa_audio_in_${Date.now()}.webm`);
    const tmpOut = pathModule.join(os.tmpdir(), `wa_audio_out_${Date.now()}.ogg`);
    fs.writeFileSync(tmpIn, Buffer.from(base64Data, 'base64'));
    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .setFfmpegPath(ffmpegStatic)
        .audioCodec('libopus')
        .audioBitrate('64k')
        .format('ogg')
        .output(tmpOut)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    const result = fs.readFileSync(tmpOut).toString('base64');
    try { fs.unlinkSync(tmpIn); } catch (_) {}
    try { fs.unlinkSync(tmpOut); } catch (_) {}
    return result;
  } catch (err) {
    console.warn('[Audio] Conversion WebM→OGG indisponible, envoi sans conversion:', err.message);
    return null;
  }
}

// ── Route PUBLIQUE — sert les fichiers médias (images, audio, vidéo, stickers) ──
// Doit être AVANT authMiddleware car le navigateur ne peut pas envoyer de JWT dans <img src>
router.get('/media/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[\w\-\.]+$/.test(filename)) return res.status(400).json({ error: 'Nom de fichier invalide' });
  const filePath = pathModule.join(__dirname, '../../uploads', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.sendFile(filePath);
});

router.use(authMiddleware);

router.get('/status', (req, res) => {
  const status = whatsappManager.getStatus(req.accountId);
  res.json(status);
});

router.post('/connect', (req, res) => {
  const profileId = req.body?.profileId ? Number(req.body.profileId) : null;
  whatsappManager.initializeClient(req.accountId, profileId);
  res.json({ success: true, message: 'Initialisation WhatsApp en cours...' });
});

router.post('/logout', async (req, res) => {
  try {
    const profileId = req.body?.profileId ? Number(req.body.profileId) : null;
    if (!profileId) return res.status(400).json({ error: 'profileId requis' });
    await whatsappManager.logout(profileId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la déconnexion WhatsApp' });
  }
});

// GET /api/messages/contacts — ALL contacts in DB for this profile
router.get('/contacts', profileMiddleware, async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { profile_id: req.profileId },
      include: { tags: { include: { tag: true } } },
      orderBy: [{ name: 'asc' }, { created_at: 'desc' }]
    });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des contacts' });
  }
});

// GET /api/messages/conversations?filter=all|unread|favorites|groups|archived
router.get('/conversations', profileMiddleware, async (req, res) => {
  try {
    const { filter } = req.query;
    let whereExtra = {};
    if (filter === 'unread') {
      whereExtra = { archived: false, unread_count: { gt: 0 } };
    } else if (filter === 'favorites') {
      whereExtra = { archived: false, is_favorite: true };
    } else if (filter === 'groups') {
      whereExtra = { archived: false, phone_number: { startsWith: 'group_' } };
    } else if (filter === 'archived') {
      whereExtra = { archived: true };
    } else {
      whereExtra = { archived: false };
    }
    const contacts = await prisma.contact.findMany({
      where: { profile_id: req.profileId, messages: { some: {} }, ...whereExtra },
      include: {
        messages: { orderBy: { created_at: 'desc' }, take: 1 },
        tags: { include: { tag: true } }
      }
    });
    const sorted = contacts.sort((a, b) => {
      const dateA = a.messages[0]?.created_at || a.created_at;
      const dateB = b.messages[0]?.created_at || b.created_at;
      return new Date(dateB) - new Date(dateA);
    });
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des conversations' });
  }
});

// POST /api/messages/favorites/:contactId — toggle favorite
router.post('/favorites/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { is_favorite: !contact.is_favorite }
    });
    res.json({ is_favorite: updated.is_favorite });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du changement de favori' });
  }
});

// POST /api/messages/conversations/archive/:contactId
router.post('/conversations/archive/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    await prisma.contact.update({ where: { id: contact.id }, data: { archived: true } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de l'archivage" });
  }
});

// POST /api/messages/conversations/unarchive/:contactId
router.post('/conversations/unarchive/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    await prisma.contact.update({ where: { id: contact.id }, data: { archived: false } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors du désarchivage" });
  }
});

// POST /api/messages/conversations/read/:contactId — mark all messages as read + reset unread_count
router.post('/conversations/read/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    await prisma.message.updateMany({
      where: { contact_id: contact.id, unread: true },
      data: { unread: false }
    });
    await prisma.contact.update({ where: { id: contact.id }, data: { unread_count: 0 } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du marquage comme lu' });
  }
});

// GET /api/messages/search?q=keyword&contactId=&profileId= — search messages
router.get('/search', profileMiddleware, async (req, res) => {
  try {
    const { q, contactId } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Mot-clé trop court' });

    const where = {
      content: { contains: q.trim() },
      contact: { profile_id: req.profileId }
    };
    if (contactId) where.contact_id = parseInt(contactId);

    const messages = await prisma.message.findMany({
      where,
      include: { contact: { select: { id: true, name: true, phone_number: true } } },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

// GET /api/messages/conversation/:contactId — messages for a contact (paginated)
router.get('/conversation/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { contact_id: contact.id },
        orderBy: { created_at: 'asc' },
        skip,
        take: limit
      }),
      prisma.message.count({ where: { contact_id: contact.id } })
    ]);

    res.json({
      messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des messages' });
  }
});

// GET /api/messages/:contactId — messages for a contact
router.get('/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const messages = await prisma.message.findMany({
      where: { contact_id: contact.id },
      orderBy: { created_at: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des messages' });
  }
});

// POST /api/messages/send
router.post('/send', profileMiddleware, async (req, res) => {
  try {
    const { contactId, content, message } = req.body;
    const text = content || message;
    if (!contactId || !text) return res.status(400).json({ error: 'contactId et message requis' });

    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    if (!contact.wa_id) return res.status(400).json({ error: 'Contact sans ID WhatsApp' });

    const client = whatsappManager.getClient(req.profileId);
    if (!client) return res.status(503).json({ error: 'WhatsApp non connecté' });

    const sentMsg = await client.sendMessage(contact.wa_id, text);
    whatsappManager.trackBotSentId(sentMsg?.id?._serialized);
    const saved = await prisma.message.create({
      data: { contact_id: contact.id, content: text, direction: 'sent', type: 'text', created_at: new Date(), unread: false }
    });
    whatsappManager.addToCache(req.profileId, contact.id, 'sent', text);
    res.json(saved);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de l'envoi du message" });
  }
});

// POST /api/messages/pause/:contactId
router.post('/pause/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { ia_paused: !contact.ia_paused }
    });
    res.json({ ia_paused: updated.ia_paused });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du changement de statut IA' });
  }
});

// GET /api/messages/notes/:contactId
router.get('/notes/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId },
      select: { notes: true }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    res.json({ notes: contact.notes || '' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des notes' });
  }
});

// PUT /api/messages/notes/:contactId
router.put('/notes/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const { notes } = req.body;
    await prisma.contact.update({ where: { id: contact.id }, data: { notes: notes || null } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la sauvegarde des notes' });
  }
});

// GET /api/messages/memory/:contactId
router.get('/memory/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const memory = await prisma.contactMemory.findUnique({ where: { contact_id: contact.id } });
    res.json({ summary: memory?.summary || null, updated_at: memory?.updated_at || null });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement de la mémoire' });
  }
});

// POST /api/messages/send-media — envoyer un fichier ou audio via WhatsApp (base64)
router.post('/send-media', profileMiddleware, async (req, res) => {
  try {
    const { contactId, filename, mimeType, data, messageType } = req.body;
    if (!contactId || !data || !mimeType) {
      return res.status(400).json({ error: 'contactId, mimeType et data requis' });
    }
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    if (!contact.wa_id) return res.status(400).json({ error: 'Contact sans ID WhatsApp' });

    const client = whatsappManager.getClient(req.profileId);
    if (!client) return res.status(503).json({ error: 'WhatsApp non connecté' });

    const { MessageMedia } = require('whatsapp-web.js');

    let sendData = data;
    let sendMime = mimeType;
    let sendFilename = filename || 'fichier';

    if (messageType === 'ptt' && mimeType && mimeType.includes('webm')) {
      const converted = await convertWebmToOgg(data);
      if (converted) {
        sendData = converted;
        sendMime = 'audio/ogg; codecs=opus';
        sendFilename = sendFilename.replace(/\.webm$/, '.ogg');
      }
    }

    const media = new MessageMedia(sendMime, sendData, sendFilename);
    const sendOptions = {};
    if (messageType === 'ptt') sendOptions.sendAudioAsVoice = true;

    const sentMsg = await client.sendMessage(contact.wa_id, media, sendOptions);
    whatsappManager.trackBotSentId(sentMsg?.id?._serialized);

    const ext = (filename || 'file').split('.').pop().replace(/[^a-z0-9]/gi, '') || 'bin';
    const saveName = `sent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const savePath = pathModule.join(__dirname, '../../uploads', saveName);
    fs.writeFileSync(savePath, Buffer.from(data, 'base64'));

    const type = messageType || (
      mimeType.startsWith('image') ? 'image' :
      mimeType.startsWith('video') ? 'video' :
      mimeType.startsWith('audio') ? 'audio' : 'document'
    );
    const contentLabel = type === 'image' ? '[Image]' : type === 'video' ? '[Vidéo]' :
      (type === 'ptt' || type === 'audio') ? '[Audio]' : '[Document]';

    const saved = await prisma.message.create({
      data: {
        contact_id: contact.id,
        content: contentLabel,
        direction: 'sent',
        type,
        media_path: saveName,
        created_at: new Date(),
        unread: false
      }
    });
    whatsappManager.addToCache(req.profileId, contact.id, 'sent', contentLabel);
    res.json(saved);
  } catch (error) {
    console.error('send-media error:', error);
    res.status(500).json({ error: "Erreur lors de l'envoi du fichier" });
  }
});

// DELETE /api/messages/memory/:contactId
router.delete('/memory/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    await prisma.contactMemory.deleteMany({ where: { contact_id: contact.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression de la mémoire' });
  }
});

module.exports = router;
