const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(profileMiddleware);

router.get('/', async (req, res) => {
  try {
    const faqs = await prisma.fAQ.findMany({
      where: { profile_id: req.profileId },
      orderBy: { created_at: 'desc' }
    });
    res.json(faqs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question et réponse requises' });
    }
    const faq = await prisma.fAQ.create({
      data: { question, answer, profile_id: req.profileId }
    });
    res.json(faq);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const faq = await prisma.fAQ.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!faq) return res.status(404).json({ error: 'FAQ introuvable' });

    const updated = await prisma.fAQ.update({
      where: { id: faq.id },
      data: { question: req.body.question, answer: req.body.answer }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const faq = await prisma.fAQ.findFirst({
      where: { id: parseInt(req.params.id), profile_id: req.profileId }
    });
    if (!faq) return res.status(404).json({ error: 'FAQ introuvable' });

    await prisma.fAQ.delete({ where: { id: faq.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
