const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

const prisma = new PrismaClient();

router.use(authMiddleware);

// GET all statuses for active profile
router.get('/', profileMiddleware, async (req, res) => {
  try {
    const statuses = await prisma.status.findMany({
      where: { profile_id: req.profileId },
      orderBy: { created_at: 'desc' }
    });
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST new status (text or image)
router.post('/', profileMiddleware, async (req, res) => {
  try {
    const { content, type, mediaBase64 } = req.body;
    if (!content?.trim() && type !== 'image') {
      return res.status(400).json({ error: 'Contenu vide' });
    }
    if (type === 'image' && !mediaBase64) {
      return res.status(400).json({ error: 'Image manquante' });
    }

    let waMsgId = null;
    try {
      waMsgId = await whatsappManager.postStatus(req.profileId, content?.trim() || '', type, mediaBase64);
    } catch (err) {
      console.error('[Status] Erreur post WA:', err.message);
    }

    const status = await prisma.status.create({
      data: {
        profile_id: req.profileId,
        content: type === 'image' ? (content?.trim() || 'Image') : content.trim(),
        type: type || 'text',
        wa_msg_id: waMsgId
      }
    });

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a status
router.delete('/:id', profileMiddleware, async (req, res) => {
  try {
    const status = await prisma.status.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!status) return res.status(404).json({ error: 'Statut introuvable' });

    if (status.wa_msg_id) {
      try {
        await whatsappManager.deleteStatus(req.profileId, status.wa_msg_id);
      } catch (err) {
        console.error('[Status] Erreur suppression WA:', err.message);
      }
    }

    await prisma.status.delete({ where: { id: status.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
