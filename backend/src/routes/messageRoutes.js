const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const pathModule = require('path');
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');
const { transcodeAudioToMp3 } = require('../services/mediaTranscoder');
const {
  ensureCapacity,
  persistWhatsAppMedia,
  deleteStoredMedia,
  getWhatsAppMessageId,
  findMatchingWhatsAppMediaMessage,
  UPLOADS_DIR
} = require('../services/mediaStorage');

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

async function findMediaMessageInChat(chat, message) {
  const targetTime = new Date(message.created_at).getTime();
  let limit = 50;
  let previousCount = -1;

  while (true) {
    const messages = await chat.fetchMessages({ limit });
    const match = findMatchingWhatsAppMediaMessage(messages, {
      type: message.type,
      createdAt: message.created_at,
      fromMe: message.direction === 'sent'
    });
    if (match) return match;

    const oldestMessageTime = Number(messages[0]?.timestamp) * 1000;
    if (!messages.length
      || messages.length <= previousCount
      || (Number.isFinite(oldestMessageTime) && oldestMessageTime <= targetTime - 2 * 60 * 1000)) {
      return null;
    }

    previousCount = messages.length;
    limit *= 2;
  }
}

async function restoreMissingMedia(message) {
  const client = whatsappManager.getClient(message.contact?.profile_id);
  if (!client) return null;

  let waMessage = null;
  if (message.wa_msg_id && typeof client.getMessageById === 'function') {
    try {
      waMessage = await client.getMessageById(message.wa_msg_id);
    } catch (error) {
      console.warn('[Media] Récupération par identifiant WhatsApp impossible:', error.message);
    }
  }
  if (!waMessage?.hasMedia && message.contact?.wa_id && typeof client.getChatById === 'function') {
    let chat = null;
    try {
      chat = await client.getChatById(message.contact.wa_id);
    } catch (error) {
      console.warn('[Media] Ouverture de la discussion WhatsApp impossible:', error.message);
    }
    if (typeof chat?.fetchMessages === 'function') {
      waMessage = await findMediaMessageInChat(chat, message);
    } else {
      const { Chat } = require('whatsapp-web.js');
      chat = new Chat(client, { id: { _serialized: message.contact.wa_id } });
      waMessage = await findMediaMessageInChat(chat, message);
    }
  }
  if (!waMessage?.hasMedia) return null;

  const storedMedia = await persistWhatsAppMedia(waMessage, prisma);
  if (!storedMedia) return null;
  try {
    await prisma.message.update({
      where: { id: message.id },
      data: {
        ...storedMedia,
        ...(getWhatsAppMessageId(waMessage) ? { wa_msg_id: getWhatsAppMessageId(waMessage) } : {})
      }
    });
  } catch (error) {
    try { deleteStoredMedia(storedMedia.media_path); } catch (cleanupError) {
      console.error('[Media] Nettoyage du média restauré impossible:', cleanupError.message);
    }
    throw error;
  }
  return storedMedia.media_path;
}

// ── Route PUBLIQUE — sert les fichiers médias (images, audio, vidéo, stickers) ──
// Doit être AVANT authMiddleware car le navigateur ne peut pas envoyer de JWT dans <img src>
router.get('/media/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (!/^[\w\-\.]+$/.test(filename)) return res.status(400).json({ error: 'Nom de fichier invalide' });
  let filePath = pathModule.join(UPLOADS_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      const message = await prisma.message.findFirst({
        where: { media_path: filename },
        select: {
          id: true,
          wa_msg_id: true,
          media_path: true,
          media_filename: true,
          media_mime: true,
          type: true,
          direction: true,
          created_at: true,
          contact: { select: { wa_id: true, profile_id: true } }
        }
      });
      if (!message) return res.status(404).json({ error: 'Fichier introuvable' });
      const restoredPath = await restoreMissingMedia(message);
      if (!restoredPath) {
        return res.status(404).json({ error: 'Fichier introuvable et média WhatsApp indisponible' });
      }
      filePath = pathModule.join(UPLOADS_DIR, pathModule.basename(restoredPath));
    }

    if (!req.query.playback) return res.sendFile(filePath);
    if (req.query.playback !== 'mp3') {
      return res.status(400).json({ error: 'Format de lecture audio non pris en charge' });
    }
    if (!/\.(ogg|oga|opus)$/i.test(filePath)) {
      return res.status(415).json({ error: 'Ce fichier audio ne nécessite pas de conversion' });
    }

    const converted = await transcodeAudioToMp3(filePath);
    res.type('audio/mpeg');
    return res.sendFile(converted.path, error => {
      converted.cleanup().catch(cleanupError => {
        console.error('[Media] Nettoyage du vocal converti impossible:', cleanupError.message);
      });
      if (error) {
        console.error('[Media] Envoi du vocal converti impossible:', error.message);
        if (!res.headersSent) res.status(error.statusCode || 500).json({ error: 'Lecture du vocal impossible' });
      }
    });
  } catch (error) {
    console.error('[Media] Traitement du média impossible:', error.message);
    if (res.headersSent) return;
    return res.status(500).json({ error: 'Traitement du média impossible' });
  }
});

router.use(authMiddleware);

// Les anciens médias sans copie locale peuvent encore être récupérés à la demande.
router.get('/media/message/:id', profileMiddleware, async (req, res) => {
  let retrievalStage = 'chargement du message';
  try {
    const message = await prisma.message.findFirst({
      where: { id: Number(req.params.id), contact: { profile_id: req.profileId } },
      select: {
        id: true,
        wa_msg_id: true,
        media_path: true,
        media_filename: true,
        media_mime: true,
        type: true,
        created_at: true,
        contact: { select: { wa_id: true } }
      }
    });
    if (!message) return res.status(404).json({ error: 'Média introuvable' });
    if (message.media_path) {
      return res.sendFile(pathModule.join(UPLOADS_DIR, pathModule.basename(message.media_path)));
    }
    const client = whatsappManager.getClient(req.profileId);
    if (!client) return res.status(503).json({ error: 'WhatsApp doit être connecté pour récupérer ce média' });

    let waMessage = null;
    if (message.wa_msg_id && typeof client.getMessageById === 'function') {
      retrievalStage = 'recherche par identifiant WhatsApp';
      try {
        waMessage = await client.getMessageById(message.wa_msg_id);
      } catch (error) {
        console.warn('[Media] Récupération par identifiant WhatsApp impossible:', error.message);
      }
    }
    if (!waMessage?.hasMedia && message.contact.wa_id && typeof client.getChatById === 'function') {
      retrievalStage = 'ouverture de la discussion WhatsApp';
      let searchCompleted = false;
      let chat = null;
      try {
        chat = await client.getChatById(message.contact.wa_id);
        if (typeof chat?.fetchMessages === 'function') {
          retrievalStage = 'recherche du média dans les messages récents';
          waMessage = await findMediaMessageInChat(chat, message);
          searchCompleted = true;
        }
      } catch (error) {
        console.warn('[Media] Ouverture classique de la discussion WhatsApp impossible:', error.message);
      }
      if (!searchCompleted) {
        retrievalStage = 'recherche directe des messages récents WhatsApp';
        const { Chat } = require('whatsapp-web.js');
        chat = new Chat(client, { id: { _serialized: message.contact.wa_id } });
        waMessage = await findMediaMessageInChat(chat, message);
      }
    }
    if (!waMessage?.hasMedia) return res.status(404).json({ error: 'Média WhatsApp indisponible' });
    retrievalStage = 'téléchargement du média WhatsApp';
    const storedMedia = await persistWhatsAppMedia(waMessage, prisma);
    if (!storedMedia) return res.status(404).json({ error: 'Média vide, temporaire ou indisponible' });
    try {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          ...storedMedia,
          ...(getWhatsAppMessageId(waMessage) ? { wa_msg_id: getWhatsAppMessageId(waMessage) } : {})
        }
      });
    } catch (error) {
      try { deleteStoredMedia(storedMedia.media_path); } catch (cleanupError) {
        console.error('Nettoyage du média non enregistré impossible:', cleanupError.message);
      }
      throw error;
    }
    return res.sendFile(pathModule.join(UPLOADS_DIR, storedMedia.media_path));
  } catch (error) {
    console.error(`[Media] Échec pendant ${retrievalStage}:`, error.stack || error.message);
    res.status(500).json({ error: `Récupération impossible pendant ${retrievalStage}` });
  }
});

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
    if (filter === 'groups') {
      await whatsappManager.syncGroupConversations(req.profileId);
    }
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
      where: {
        profile_id: req.profileId,
        ...whereExtra,
        OR: [
          { messages: { some: {} } },
          { phone_number: { startsWith: 'group_' } },
          ...(filter === 'favorites' ? [{ is_favorite: true }] : [])
        ]
      },
      include: {
        messages: { orderBy: { created_at: 'desc' }, take: 1 },
        tags: { include: { tag: true } }
      }
    });
    const sorted = contacts.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      const dateA = a.messages[0]?.created_at || a.created_at;
      const dateB = b.messages[0]?.created_at || b.created_at;
      return new Date(dateB) - new Date(dateA);
    });
    // Ne pas interroger WhatsApp pour chaque conversation au chargement de la page.
    // Les noms sont enrichis à la réception ou à l’envoi d’un message, à la demande.
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des conversations' });
  }
});

// POST /api/messages/conversations/pin/:contactId — toggle pin (max 3 per profile)
router.post('/conversations/pin/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contactId = Number(req.params.contactId);
    if (!Number.isSafeInteger(contactId) || contactId <= 0) return res.status(400).json({ error: 'Contact invalide' });

    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId, profile_id: req.profileId },
        select: { id: true, is_pinned: true }
      });
      if (!contact) return { notFound: true };

      if (!contact.is_pinned) {
        const pinnedCount = await tx.contact.count({
          where: { profile_id: req.profileId, is_pinned: true }
        });
        if (pinnedCount >= 3) return { limitReached: true };
      }

      const updated = await tx.contact.update({
        where: { id: contact.id },
        data: { is_pinned: !contact.is_pinned },
        select: { is_pinned: true }
      });
      return { is_pinned: updated.is_pinned };
    });

    if (result.notFound) return res.status(404).json({ error: 'Discussion introuvable' });
    if (result.limitReached) {
      return res.status(409).json({ error: 'Vous pouvez épingler trois discussions maximum.' });
    }
    res.json(result);
  } catch (error) {
    console.error('Erreur épinglage discussion:', error.message);
    res.status(500).json({ error: 'Erreur lors du changement de statut épinglé' });
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

    try {
      await whatsappManager.backfillConversationMedia(req.profileId, contact);
    } catch (error) {
      console.error('[Media] Récupération des médias manquants de la discussion impossible:', error.message);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { contact_id: contact.id },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take: limit
      }),
      prisma.message.count({ where: { contact_id: contact.id } })
    ]);

    messages.reverse();
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

    const sentMsg = await whatsappManager.sendMessage(req.profileId, contact.wa_id, text, { fallbackPhone: contact.phone_number });
    const saved = await prisma.message.create({
      data: {
        contact_id: contact.id,
        content: text,
        direction: 'sent',
        origin: 'manual',
        type: 'text',
        created_at: new Date(),
        unread: false,
        wa_msg_id: getWhatsAppMessageId(sentMsg)
      }
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
  let uploadedFilePath = null;
  let whatsappAccepted = false;
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
    if (messageType === 'document') sendOptions.sendMediaAsDocument = true;

    const ext = (filename || 'file').split('.').pop().replace(/[^a-z0-9]/gi, '') || 'bin';
    const saveName = `sent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    uploadedFilePath = pathModule.join(UPLOADS_DIR, saveName);
    await ensureCapacity(prisma, Math.ceil(Buffer.byteLength(data, 'base64')));
    fs.writeFileSync(uploadedFilePath, Buffer.from(data, 'base64'), { flag: 'wx' });

    const mediaResult = await whatsappManager.sendMedia(req.profileId, contact.wa_id, media, sendOptions, contact.phone_number);
    const sentMsg = mediaResult.sent;
    whatsappAccepted = true;

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
        origin: 'manual',
        type,
        media_path: saveName,
        wa_msg_id: getWhatsAppMessageId(sentMsg),
        media_filename: filename || null,
        media_mime: mimeType || null,
        created_at: new Date(),
        unread: false
      }
    });
    whatsappManager.addToCache(req.profileId, contact.id, 'sent', contentLabel);
    res.json(saved);
  } catch (error) {
    console.error('send-media error:', error);
    if (uploadedFilePath && !whatsappAccepted) {
      try { fs.unlinkSync(uploadedFilePath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('[Media] Nettoyage du média non envoyé impossible:', cleanupError.message);
        }
      }
    }
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
