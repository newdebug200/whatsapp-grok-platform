const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET toutes les FAQ
router.get('/', async (req, res) => {
  try {
    const faqs = await prisma.fAQ.findMany({
      orderBy: { created_at: 'desc' }
    });
    res.json(faqs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET une FAQ
router.get('/:id', async (req, res) => {
  try {
    const faq = await prisma.fAQ.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    res.json(faq);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST nouvelle FAQ
router.post('/', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const faq = await prisma.fAQ.create({
      data: { question, answer }
    });
    res.json(faq);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT modifier FAQ
router.put('/:id', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const faq = await prisma.fAQ.update({
      where: { id: parseInt(req.params.id) },
      data: { question, answer }
    });
    res.json(faq);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE FAQ
router.delete('/:id', async (req, res) => {
  try {
    await prisma.fAQ.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;