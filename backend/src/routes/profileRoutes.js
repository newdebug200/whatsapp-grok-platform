const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const profiles = await prisma.whatsAppProfile.findMany({
      where: { account_id: req.accountId },
      orderBy: { created_at: 'asc' }
    });
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const profile = await prisma.whatsAppProfile.findFirst({
      where: { id: parseInt(req.params.id), account_id: req.accountId }
    });
    if (!profile) return res.status(404).json({ error: 'Profil introuvable' });

    const updated = await prisma.whatsAppProfile.update({
      where: { id: profile.id },
      data: { display_name: req.body.display_name }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const profile = await prisma.whatsAppProfile.findFirst({
      where: { id: parseInt(req.params.id), account_id: req.accountId }
    });
    if (!profile) return res.status(404).json({ error: 'Profil introuvable' });

    const contacts = await prisma.contact.findMany({ where: { profile_id: profile.id }, select: { id: true } });
    const contactIds = contacts.map(c => c.id);

    if (contactIds.length > 0) {
      await prisma.message.deleteMany({ where: { contact_id: { in: contactIds } } });
    }
    await prisma.contact.deleteMany({ where: { profile_id: profile.id } });
    await prisma.fAQ.deleteMany({ where: { profile_id: profile.id } });
    await prisma.botConfig.deleteMany({ where: { profile_id: profile.id } });
    await prisma.whatsAppProfile.delete({ where: { id: profile.id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
