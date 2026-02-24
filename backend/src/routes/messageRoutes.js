const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Récupérer tous les utilisateurs avec leurs derniers messages
router.get('/conversations', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les messages d'un utilisateur
router.get('/conversation/:userId', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { user_id: parseInt(req.params.userId) },
      orderBy: { created_at: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer le statut WhatsApp
router.get('/status', async (req, res) => {
  const whatsappService = require('../services/whatsappService');
  res.json(whatsappService.getStatus());
});

// Déconnexion WhatsApp
router.post('/logout', async (req, res) => {
  try {
    const whatsappService = require('../services/whatsappService');
    await whatsappService.logout();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;