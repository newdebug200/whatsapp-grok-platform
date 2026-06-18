const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

router.get('/', async (req, res) => {
  try {
    const replies = await prisma.quickReply.findMany({
      where: { profile_id: req.profileId },
      orderBy: { created_at: 'asc' }
    });
    res.json(replies);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement templates' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Titre requis' });
    if (!content?.trim()) return res.status(400).json({ error: 'Contenu requis' });
    const created = await prisma.quickReply.create({
      data: { profile_id: req.profileId, title: title.trim(), content: content.trim() }
    });
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création template' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const qr = await prisma.quickReply.findFirst({ where: { id, profile_id: req.profileId } });
    if (!qr) return res.status(404).json({ error: 'Template introuvable' });
    const { title, content } = req.body;
    const updated = await prisma.quickReply.update({
      where: { id },
      data: {
        title: title?.trim() ?? qr.title,
        content: content?.trim() ?? qr.content
      }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour template' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const qr = await prisma.quickReply.findFirst({ where: { id, profile_id: req.profileId } });
    if (!qr) return res.status(404).json({ error: 'Template introuvable' });
    await prisma.quickReply.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression template' });
  }
});

module.exports = router;
