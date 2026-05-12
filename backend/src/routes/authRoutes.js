const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const prisma = new PrismaClient();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, mot de passe et nom sont requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const existing = await prisma.account.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const account = await prisma.account.create({
      data: {
        email,
        password: hashedPassword,
        name,
        botConfig: {
          create: {
            bot_name: 'Botora',
            bot_info: '',
            bot_behavior: '',
            ia_enabled: true
          }
        }
      }
    });

    const token = jwt.sign({ accountId: account.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      account: { id: account.id, email: account.email, name: account.name }
    });
  } catch (error) {
    console.error('Erreur register:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const isValid = await bcrypt.compare(password, account.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign({ accountId: account.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      account: { id: account.id, email: account.email, name: account.name }
    });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.accountId },
      select: { id: true, email: true, name: true, created_at: true }
    });
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
