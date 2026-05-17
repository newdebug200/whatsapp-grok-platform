const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, mot de passe et nom sont requis' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Format d'email invalide" });
    }
    const existing = await prisma.account.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const account = await prisma.account.create({
      data: { email: email.toLowerCase(), password: hashedPassword, name }
    });
    const token = jwt.sign({ accountId: account.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, account: { id: account.id, email: account.email, name: account.name } });
  } catch (error) {
    console.error('Erreur register:', error);
    res.status(500).json({ error: "Erreur lors de l'inscription" });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    const account = await prisma.account.findUnique({ where: { email: email.toLowerCase() } });
    if (!account) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const isValid = await bcrypt.compare(password, account.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const token = jwt.sign({ accountId: account.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, account: { id: account.id, email: account.email, name: account.name } });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
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
    res.status(500).json({ error: 'Erreur lors de la récupération du compte' });
  }
});

router.post('/reset-request', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const account = await prisma.account.findUnique({ where: { email: email.toLowerCase() } });
    if (!account) {
      return res.json({ message: 'Si cet email existe, un token de réinitialisation a été généré.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.account.update({
      where: { id: account.id },
      data: { reset_token: token, reset_token_expiry: expiry }
    });
    console.log(`[Reset] Token pour ${email}: ${token} (expire dans 1h)`);
    res.json({
      message: 'Token de réinitialisation généré.',
      reset_token: token,
      note: 'En production, ce token serait envoyé par email.'
    });
  } catch (error) {
    console.error('Erreur reset-request:', error);
    res.status(500).json({ error: 'Erreur lors de la demande de réinitialisation' });
  }
});

router.post('/reset-confirm', authLimiter, async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }
    const account = await prisma.account.findFirst({
      where: { reset_token: token, reset_token_expiry: { gt: new Date() } }
    });
    if (!account) {
      return res.status(400).json({ error: 'Token invalide ou expiré' });
    }
    const hashed = await bcrypt.hash(new_password, 12);
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed, reset_token: null, reset_token_expiry: null }
    });
    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Erreur reset-confirm:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
  }
});

router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis pour confirmer la suppression' });
    const account = await prisma.account.findUnique({ where: { id: req.accountId } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    const isValid = await bcrypt.compare(password, account.password);
    if (!isValid) return res.status(401).json({ error: 'Mot de passe incorrect' });

    const profiles = await prisma.whatsAppProfile.findMany({
      where: { account_id: req.accountId },
      select: { id: true }
    });
    const profileIds = profiles.map(p => p.id);
    if (profileIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { profile_id: { in: profileIds } },
        select: { id: true }
      });
      const contactIds = contacts.map(c => c.id);
      if (contactIds.length > 0) {
        await prisma.message.deleteMany({ where: { contact_id: { in: contactIds } } });
      }
      await prisma.contact.deleteMany({ where: { profile_id: { in: profileIds } } });
      await prisma.fAQ.deleteMany({ where: { profile_id: { in: profileIds } } });
      await prisma.botConfig.deleteMany({ where: { profile_id: { in: profileIds } } });
      await prisma.status.deleteMany({ where: { profile_id: { in: profileIds } } });
      await prisma.whatsAppProfile.deleteMany({ where: { account_id: req.accountId } });
    }
    await prisma.account.delete({ where: { id: req.accountId } });
    res.json({ success: true, message: 'Compte supprimé définitivement' });
  } catch (error) {
    console.error('Erreur suppression compte:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du compte' });
  }
});

module.exports = router;
