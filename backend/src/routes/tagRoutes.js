const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

// GET /api/tags — list all tags for the active profile
router.get('/', async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { profile_id: req.profileId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: 'asc' }
    });
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du chargement des tags' });
  }
});

// POST /api/tags — create a tag
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom du tag requis' });
    const tag = await prisma.tag.create({
      data: {
        profile_id: req.profileId,
        name: name.trim(),
        color: color || '#25d366'
      },
      include: { _count: { select: { contacts: true } } }
    });
    res.json(tag);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ce tag existe déjà' });
    res.status(500).json({ error: 'Erreur lors de la création du tag' });
  }
});

// PUT /api/tags/:id — update a tag
router.put('/:id', async (req, res) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!tag) return res.status(404).json({ error: 'Tag introuvable' });
    const { name, color } = req.body;
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(color ? { color } : {})
      },
      include: { _count: { select: { contacts: true } } }
    });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ce tag existe déjà' });
    res.status(500).json({ error: 'Erreur lors de la mise à jour du tag' });
  }
});

// DELETE /api/tags/:id — delete a tag
router.delete('/:id', async (req, res) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!tag) return res.status(404).json({ error: 'Tag introuvable' });
    await prisma.tag.delete({ where: { id: tag.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la suppression du tag' });
  }
});

// POST /api/tags/:id/contacts — assign tag to one or more contacts
router.post('/:id/contacts', async (req, res) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!tag) return res.status(404).json({ error: 'Tag introuvable' });

    const { contact_ids } = req.body;
    if (!Array.isArray(contact_ids) || contact_ids.length === 0)
      return res.status(400).json({ error: 'contact_ids requis' });

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contact_ids.map(Number) }, profile_id: req.profileId },
      select: { id: true }
    });

    await prisma.contactTag.createMany({
      data: contacts.map(c => ({ contact_id: c.id, tag_id: tag.id })),
      skipDuplicates: true
    });

    res.json({ success: true, assigned: contacts.length });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de l'assignation du tag" });
  }
});

// DELETE /api/tags/:id/contacts/:contactId — remove tag from a contact
router.delete('/:id/contacts/:contactId', async (req, res) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!tag) return res.status(404).json({ error: 'Tag introuvable' });

    const contact = await prisma.contact.findFirst({
      where: { id: parseInt(req.params.contactId), profile_id: req.profileId }
    });
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    await prisma.contactTag.deleteMany({
      where: { contact_id: contact.id, tag_id: tag.id }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du retrait du tag' });
  }
});

// GET /api/tags/contacts?tag_id=X — get contacts filtered by tag
router.get('/contacts', async (req, res) => {
  try {
    const tagId = req.query.tag_id ? parseInt(req.query.tag_id) : null;

    const where = { profile_id: req.profileId };
    if (tagId) {
      where.tags = { some: { tag_id: tagId } };
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        messages: { orderBy: { created_at: 'desc' }, take: 1 }
      },
      orderBy: { name: 'asc' }
    });

    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du chargement des contacts' });
  }
});

module.exports = router;
