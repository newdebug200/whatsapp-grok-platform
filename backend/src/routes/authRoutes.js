const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const centralSync = require('../services/centralSync');
const { normalizeLanguage, SUPPORTED_LANGUAGES, translate } = require('../utils/i18n');

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

    // First account ever becomes admin
    const accountCount = await prisma.account.count();
    const role = accountCount === 0 ? 'admin' : 'user';

    const centralUser = await centralSync.syncAccount({ email: email.toLowerCase(), password_plain: password, name, phone: null });
    if (!centralUser?.password_hash) {
      return res.status(502).json({ error: 'Le compte n’a pas été confirmé par l’API centrale. Inscription non validée.' });
    }
    const account = await prisma.account.create({
      data: { email: email.toLowerCase(), password: centralUser.password_hash, name, role }
    });
    const token = jwt.sign({ accountId: account.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, account: { id: account.id, email: account.email, name: account.name, role: account.role, language: normalizeLanguage(account.language), control_center_access: centralUser?.control_center_access ?? null } });
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
    const normalizedEmail = email.toLowerCase();
    let account = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    let isValid = account ? await bcrypt.compare(password, account.password) : false;
    if (!isValid) {
      const centralUser = await centralSync.authenticateAccount(normalizedEmail, password);
      if (!centralUser?.password_hash) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      account = await prisma.account.upsert({
        where: { email: normalizedEmail },
        update: { name: centralUser.name, password: centralUser.password_hash, is_blocked: false },
        create: { email: normalizedEmail, name: centralUser.name, password: centralUser.password_hash, role: 'user' }
      });
    }
    if (account.is_blocked) return res.status(403).json({ error: 'Compte bloqué.' });
    const centralAccess = await centralSync.getAccount(normalizedEmail);
    if (centralAccess?.access_type === 'suspended') return res.status(403).json({ error: 'Votre accès est suspendu. Contactez le support.' });
    if (centralAccess?.access_type === 'banned') return res.status(403).json({ error: 'Cette licence a été bannie. Contactez le support.' });
    centralSync.syncAccount(account).catch(() => {});
    centralSync.syncCreditUsage(account.id).catch(() => {});
    const token = jwt.sign({ accountId: account.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, account: { id: account.id, email: account.email, name: account.name, role: account.role, language: normalizeLanguage(account.language), control_center_access: centralAccess?.control_center_access ?? null } });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.accountId },
      select: { id: true, email: true, name: true, role: true, language: true, created_at: true, credit_balance: true, is_blocked: true }
    });
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    const central = await centralSync.getAccount(account.email);
    if (central) {
      centralSync.syncCreditUsage(account.id).catch(() => {});
      const updated = await prisma.account.update({
        where: { id: account.id },
        data: { name: central.name || account.name, credit_balance: Number(central.credits_balance || 0) },
        select: { id: true, email: true, name: true, role: true, language: true, created_at: true, credit_balance: true, is_blocked: true }
      });
      return res.json({ ...updated, control_center_access: central.control_center_access ?? null, central_status: central.status, central_plan_id: central.plan_id, central_access_allowed: central.access_allowed === undefined ? true : Boolean(central.access_allowed), central_suspended: ['suspended', 'banned'].includes(central.access_type), central_access_type: central.access_type || 'none', central_access_ends_at: central.access_ends_at || null, central_trial_ends_at: central.trial_ends_at, central_subscription_ends_at: central.subscription_ends_at || null, central_trial_days_left: central.trial_days_left ?? null, central_subscription_days_left: central.subscription_days_left ?? null, central_server_time: central.server_time || null, central_synced: true });
    }
    res.json({ ...account, control_center_access: null, central_synced: false, central_sync_error: 'Profil central indisponible' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération du compte' });
  }
});

router.post('/language', authMiddleware, async (req, res) => {
  try {
    const language = normalizeLanguage(req.body?.language);
    if (!SUPPORTED_LANGUAGES.includes(req.body?.language)) {
      return res.status(400).json({ error: translate('Langue non prise en charge', req.language) });
    }
    const account = await prisma.account.update({
      where: { id: req.accountId },
      data: { language },
      select: { id: true, language: true }
    });
    res.locals.responseLanguage = language;
    res.json({ success: true, language: account.language, message: translate('Langue mise à jour', language) });
  } catch (error) {
    console.error('Erreur mise à jour langue:', error);
    res.status(500).json({ error: translate('Erreur lors de la mise à jour de la langue', req.language) });
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
