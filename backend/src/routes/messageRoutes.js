const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

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

router.get('/conversations', profileMiddleware, async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { profile_id: req.profileId, messages: { some: {} } },
      include: {
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1
        },
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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des messages' });
  }
});

router.post('/send', profileMiddleware, async (req, res) => {
  try {
    const { contactId, content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Message vide' });
    }
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const waId = contact.wa_id || (contact.phone_number.replace('+', '') + '@c.us');
    await whatsappManager.sendMessage(req.profileId, waId, content.trim());

    const msg = await prisma.message.create({
      data: {
        contact_id: contact.id,
        content: content.trim(),
        direction: 'sent',
        type: 'text',
        created_at: new Date()
      }
    });
    await prisma.contact.update({
      where: { id: contact.id },
      data: { ia_paused: true }
    });
    res.json({ success: true, message: msg });
  } catch (error) {
    console.error('Erreur send message:', error);
    res.status(500).json({ error: "Erreur lors de l'envoi du message" });
  }
});

router.post('/toggle-ia/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const newPaused = !contact.ia_paused;
    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        ia_paused: newPaused,
        // When human releases the contact (unpausing), clear sensitive flag too
        ...(newPaused === false ? { sensitive_flagged: false } : {})
      }
    });
    res.json({ success: true, ia_paused: updated.ia_paused, sensitive_flagged: updated.sensitive_flagged });
  } catch (error) {
    console.error('Erreur toggle IA:', error);
    res.status(500).json({ error: "Erreur lors du changement de mode IA" });
  }
});

module.exports = router;
