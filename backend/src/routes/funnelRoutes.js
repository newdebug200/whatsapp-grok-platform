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

// GET /api/funnel/counts — just the per-stage counts (cheap, loads instantly)
router.get('/counts', async (req, res) => {
  try {
    const results = await Promise.all(
      FUNNEL_STAGES.map(stage =>
        prisma.contact.count({ where: { profile_id: req.profileId, funnel_stage: stage, archived: false } })
          .then(count => ({ stage, label: STAGE_LABELS[stage], count }))
      )
    );
    res.json({ stages: FUNNEL_STAGES, labels: STAGE_LABELS, counts: results });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des compteurs du funnel' });
  }
});

// GET /api/funnel?stage=prospect&limit=30&offset=0 — contacts for a single column.
// Only fetches one stage at a time (with a cap) and selects the minimal fields the
// Kanban card actually renders, instead of the whole contact + tags graph.
router.get('/', async (req, res) => {
  try {
    const stage = FUNNEL_STAGES.includes(req.query.stage) ? req.query.stage : null;
    if (!stage) {
      return res.status(400).json({ error: 'Paramètre "stage" requis. Valeurs acceptées: ' + FUNNEL_STAGES.join(', ') });
    }
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: { profile_id: req.profileId, archived: false, funnel_stage: stage },
        select: {
          id: true, name: true, phone_number: true, funnel_stage: true, unread_count: true,
          messages: { orderBy: { created_at: 'desc' }, take: 1, select: { content: true, type: true, created_at: true } }
        },
        orderBy: [{ name: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.contact.count({ where: { profile_id: req.profileId, archived: false, funnel_stage: stage } })
    ]);

    res.json({ stage, label: STAGE_LABELS[stage], contacts, total, hasMore: offset + contacts.length < total });
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

module.exports = router;
