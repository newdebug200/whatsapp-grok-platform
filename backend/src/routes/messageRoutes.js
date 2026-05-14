const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/status', (req, res) => {
  const status = whatsappManager.getStatus(req.accountId);
  res.json(status);
});

router.post('/connect', (req, res) => {
  whatsappManager.initializeClient(req.accountId);
  res.json({ success: true, message: 'Initialisation WhatsApp en cours...' });
});

router.post('/logout', async (req, res) => {
  try {
    await whatsappManager.logout(req.accountId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conversations', profileMiddleware, async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { profile_id: req.profileId },
      include: {
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1
        }
      }
    });

    const sorted = contacts.sort((a, b) => {
      const dateA = a.messages[0]?.created_at || a.created_at;
      const dateB = b.messages[0]?.created_at || b.created_at;
      return new Date(dateB) - new Date(dateA);
    });

    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conversation/:contactId', profileMiddleware, async (req, res) => {
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
    res.status(500).json({ error: error.message });
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
    await whatsappManager.sendMessage(req.accountId, waId, content.trim());

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
    res.status(500).json({ error: error.message });
  }
});

router.post('/toggle-ia/:contactId', profileMiddleware, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { ia_paused: !contact.ia_paused }
    });

    res.json({ success: true, ia_paused: updated.ia_paused });
  } catch (error) {
    console.error('Erreur toggle IA:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
