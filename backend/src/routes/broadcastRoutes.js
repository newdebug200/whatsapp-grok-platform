const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const whatsappManager = require('../services/whatsappManager');

router.use(authMiddleware);
router.use(profileMiddleware);

// GET /api/broadcast/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { profile_id: req.profileId },
      include: {
        messages: { orderBy: { order_index: 'asc' } }
      },
      orderBy: { created_at: 'desc' }
    });

    const result = await Promise.all(campaigns.map(async (c) => {
      const [pending, sent, failed] = await Promise.all([
        prisma.campaignTarget.count({ where: { campaign_id: c.id, status: 'pending' } }),
        prisma.campaignTarget.count({ where: { campaign_id: c.id, status: 'sent' } }),
        prisma.campaignTarget.count({ where: { campaign_id: c.id, status: 'failed' } })
      ]);
      const total = pending + sent + failed;
      return { ...c, progress: { pending, sent, failed, total } };
    }));

    res.json(result);
  } catch (error) {
    console.error('Erreur GET campaigns:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des campagnes' });
  }
});

// POST /api/broadcast/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const { name, messages, contact_ids } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Nom de campagne requis' });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Au moins un message requis' });
    }
    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins un contact' });
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contact_ids.map(Number) }, profile_id: req.profileId },
      select: { id: true }
    });

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'Aucun contact valide sélectionné' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        profile_id: req.profileId,
        name: name.trim(),
        messages: {
          create: messages.map((m, i) => ({
            content: m.content,
            order_index: i,
            delay_after_seconds: m.delay_after_seconds || 0
          }))
        },
        targets: {
          create: contacts.map(c => ({ contact_id: c.id }))
        }
      },
      include: {
        messages: { orderBy: { order_index: 'asc' } },
        targets: {
          include: { contact: { select: { id: true, name: true, phone_number: true } } }
        }
      }
    });

    res.json(campaign);
  } catch (error) {
    console.error('Erreur POST campaign:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la campagne' });
  }
});

// GET /api/broadcast/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId },
      include: {
        messages: { orderBy: { order_index: 'asc' } },
        targets: {
          include: { contact: { select: { id: true, name: true, phone_number: true } } },
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement de la campagne' });
  }
});

// POST /api/broadcast/campaigns/:id/start
router.post('/campaigns/:id/start', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });

    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Campagne déjà en cours' });
    }
    if (campaign.status === 'completed') {
      return res.status(400).json({ error: 'Campagne déjà terminée' });
    }

    if (campaign.status === 'paused') {
      await prisma.campaignTarget.updateMany({
        where: { campaign_id: campaign.id, status: 'failed' },
        data: { status: 'pending', error: null }
      });
    }

    whatsappManager.startCampaign(campaign.id, req.profileId);
    res.json({ success: true, message: 'Campagne démarrée' });
  } catch (error) {
    console.error('Erreur start campaign:', error);
    res.status(500).json({ error: 'Erreur lors du démarrage de la campagne' });
  }
});

// POST /api/broadcast/campaigns/:id/stop
router.post('/campaigns/:id/stop', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });

    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });

    await whatsappManager.stopCampaign(campaign.id);
    res.json({ success: true, message: 'Campagne mise en pause' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise en pause' });
  }
});

// DELETE /api/broadcast/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });

    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Arrêtez la campagne avant de la supprimer' });
    }

    await prisma.campaignTarget.deleteMany({ where: { campaign_id: campaign.id } });
    await prisma.campaignMessage.deleteMany({ where: { campaign_id: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;
