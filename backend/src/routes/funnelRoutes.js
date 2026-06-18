const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

const FUNNEL_STAGES = ['prospect', 'interesse', 'client', 'fidele'];
const STAGE_LABELS = {
  prospect: 'Prospect',
  interesse: 'Intéressé',
  client: 'Client',
  fidele: 'Fidèle'
};

// GET /api/funnel — contacts grouped by stage
router.get('/', async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { profile_id: req.profileId, archived: false },
      include: {
        tags: { include: { tag: true } },
        messages: { orderBy: { created_at: 'desc' }, take: 1 }
      },
      orderBy: [{ name: 'asc' }]
    });

    const grouped = {};
    for (const stage of FUNNEL_STAGES) {
      grouped[stage] = {
        label: STAGE_LABELS[stage],
        contacts: contacts.filter(c => (c.funnel_stage || 'prospect') === stage)
      };
    }
    res.json({ stages: FUNNEL_STAGES, labels: STAGE_LABELS, grouped });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement du funnel' });
  }
});

// GET /api/funnel/stages — just the stage definitions
router.get('/stages', (req, res) => {
  res.json({ stages: FUNNEL_STAGES, labels: STAGE_LABELS });
});

// PUT /api/funnel/contact/:contactId — update funnel stage
router.put('/contact/:contactId', async (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage || !FUNNEL_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'Étape invalide. Valeurs acceptées: ' + FUNNEL_STAGES.join(', ') });
    }
    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { funnel_stage: stage }
    });
    res.json({ success: true, funnel_stage: updated.funnel_stage });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'étape" });
  }
});

// GET /api/funnel/stats — count per stage
router.get('/stats', async (req, res) => {
  try {
    const results = await Promise.all(
      FUNNEL_STAGES.map(stage =>
        prisma.contact.count({ where: { profile_id: req.profileId, funnel_stage: stage, archived: false } })
          .then(count => ({ stage, label: STAGE_LABELS[stage], count }))
      )
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des statistiques du funnel' });
  }
});

module.exports = router;
