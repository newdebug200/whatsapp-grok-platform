const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
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
    await prisma.whatsAppSession.upsert({
      where: { account_id: req.accountId },
      create: { account_id: req.accountId, is_connected: false },
      update: { is_connected: false }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { account_id: req.accountId },
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

router.get('/conversation/:contactId', async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), account_id: req.accountId }
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

module.exports = router;
