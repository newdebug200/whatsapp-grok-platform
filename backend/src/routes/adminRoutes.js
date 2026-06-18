const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const axios = require('axios');
const whatsappManager = require('../services/whatsappManager');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(adminMiddleware);

// ─────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/users — list all accounts with usage quotas
router.get('/users', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        created_at: true,
        credit_balance: true,
        is_blocked: true,
        whatsappProfiles: {
          select: {
            id: true,
            phone_number: true,
            display_name: true,
            is_connected: true,
            contacts: {
              select: {
                id: true,
                messages: {
                  select: { direction: true, created_at: true },
                  orderBy: { created_at: 'desc' }
                }
              }
            },
            faqs: { select: { id: true } }
          }
        }
      }
    });

    const result = accounts.map(a => {
      let contactCount = 0, faqCount = 0, msgSent = 0, msgReceived = 0, lastActivity = null;

      for (const p of a.whatsappProfiles) {
        faqCount += p.faqs.length;
        for (const c of p.contacts) {
          contactCount++;
          for (const m of c.messages) {
            if (m.direction === 'sent') msgSent++;
            else if (m.direction === 'received') msgReceived++;
            if (!lastActivity || new Date(m.created_at) > new Date(lastActivity)) {
              lastActivity = m.created_at;
            }
          }
        }
      }

      return {
        id: a.id,
        email: a.email,
        name: a.name,
        role: a.role,
        created_at: a.created_at,
        credit_balance: a.credit_balance,
        is_blocked: a.is_blocked,
        profileCount: a.whatsappProfiles.length,
        connectedProfiles: a.whatsappProfiles.filter(p => p.is_connected).length,
        contactCount,
        faqCount,
        msgSent,
        msgReceived,
        lastActivity
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur GET admin/users:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des utilisateurs' });
  }
});

// PATCH /api/admin/users/:id/role — change role
router.patch('/users/:id/role', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide. Valeurs acceptées : admin, user' });
    }
    if (targetId === req.accountId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
    }

    const target = await prisma.account.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const updated = await prisma.account.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, email: true, name: true, role: true }
    });

    res.json({ success: true, account: updated });
  } catch (error) {
    console.error('Erreur PATCH admin/users/:id/role:', error);
    res.status(500).json({ error: 'Erreur lors du changement de rôle' });
  }
});

// PATCH /api/admin/users/:id/block — block or unblock a user
router.patch('/users/:id/block', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { is_blocked } = req.body;

    if (typeof is_blocked !== 'boolean') {
      return res.status(400).json({ error: 'is_blocked doit être un booléen' });
    }
    if (targetId === req.accountId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas bloquer votre propre compte' });
    }

    const target = await prisma.account.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const updated = await prisma.account.update({
      where: { id: targetId },
      data: { is_blocked },
      select: { id: true, email: true, name: true, is_blocked: true }
    });

    res.json({ success: true, account: updated });
  } catch (error) {
    console.error('Erreur PATCH admin/users/:id/block:', error);
    res.status(500).json({ error: 'Erreur lors du blocage/déblocage' });
  }
});

// DELETE /api/admin/users/:id — delete a user account and all data
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);

    if (targetId === req.accountId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte depuis le panel admin' });
    }

    const target = await prisma.account.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const profiles = await prisma.whatsAppProfile.findMany({
      where: { account_id: targetId },
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
      await prisma.whatsAppProfile.deleteMany({ where: { account_id: targetId } });
    }

    await prisma.creditTransaction.deleteMany({ where: { account_id: targetId } });
    await prisma.account.delete({ where: { id: targetId } });

    res.json({ success: true, message: `Compte de ${target.name} supprimé` });
  } catch (error) {
    console.error('Erreur DELETE admin/users/:id:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ─────────────────────────────────────────────────────────────
// CREDITS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/users/:id/credits — get credit transactions for a user
router.get('/users/:id/credits', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const account = await prisma.account.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true, credit_balance: true }
    });
    if (!account) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const transactions = await prisma.creditTransaction.findMany({
      where: { account_id: targetId },
      orderBy: { created_at: 'desc' },
      take: 50
    });

    res.json({ account, transactions });
  } catch (error) {
    console.error('Erreur GET admin/users/:id/credits:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des crédits' });
  }
});

// POST /api/admin/users/:id/credits — add or remove credits manually
router.post('/users/:id/credits', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { amount, description } = req.body;

    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const parsedAmount = parseFloat(amount);
    const target = await prisma.account.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const newBalance = Math.max(0, target.credit_balance + parsedAmount);

    const [updated] = await prisma.$transaction([
      prisma.account.update({
        where: { id: targetId },
        data: { credit_balance: newBalance },
        select: { id: true, name: true, email: true, credit_balance: true }
      }),
      prisma.creditTransaction.create({
        data: {
          account_id: targetId,
          amount: parsedAmount,
          type: parsedAmount >= 0 ? 'credit' : 'debit',
          description: description?.trim() || (parsedAmount >= 0 ? 'Rechargement admin' : 'Déduction admin')
        }
      })
    ]);

    res.json({ success: true, account: updated });
  } catch (error) {
    console.error('Erreur POST admin/users/:id/credits:', error);
    res.status(500).json({ error: 'Erreur lors de la modification des crédits' });
  }
});

// ─────────────────────────────────────────────────────────────
// PLATFORM CONFIG (feature flags)
// ─────────────────────────────────────────────────────────────

// GET /api/admin/platform-config — get all feature flags
router.get('/platform-config', async (req, res) => {
  try {
    const rows = await prisma.platformConfig.findMany();
    const config = {};
    for (const row of rows) config[row.key] = row.value;
    res.json(config);
  } catch (error) {
    console.error('Erreur GET admin/platform-config:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
  }
});

// PUT /api/admin/platform-config — update one or more feature flags
router.put('/platform-config', async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Corps invalide' });
    }

    const ops = Object.entries(updates).map(([key, value]) =>
      prisma.platformConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    );

    await prisma.$transaction(ops);

    const rows = await prisma.platformConfig.findMany();
    const config = {};
    for (const row of rows) config[row.key] = row.value;

    res.json({ success: true, config });
  } catch (error) {
    console.error('Erreur PUT admin/platform-config:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la configuration' });
  }
});

// ─────────────────────────────────────────────────────────────
// PROFILES & VERIFICATION TRIGGERS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/profiles — admin's own WhatsApp profiles
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await prisma.whatsAppProfile.findMany({
      where: { account_id: req.accountId },
      select: { id: true, phone_number: true, display_name: true, is_connected: true }
    });
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement profils' });
  }
});

// GET /api/admin/verification-triggers/:profileId
router.get('/verification-triggers/:profileId', async (req, res) => {
  try {
    const profileId = parseInt(req.params.profileId);
    const profile = await prisma.whatsAppProfile.findFirst({ where: { id: profileId, account_id: req.accountId } });
    if (!profile) return res.status(403).json({ error: 'Accès refusé' });
    const triggers = await prisma.verificationTrigger.findMany({
      where: { profile_id: profileId },
      orderBy: { created_at: 'asc' }
    });
    res.json(triggers);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement triggers' });
  }
});

// POST /api/admin/verification-triggers
router.post('/verification-triggers', async (req, res) => {
  try {
    const { profile_id, text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Texte requis' });
    const profile = await prisma.whatsAppProfile.findFirst({ where: { id: parseInt(profile_id), account_id: req.accountId } });
    if (!profile) return res.status(403).json({ error: 'Accès refusé' });
    const trigger = await prisma.verificationTrigger.create({
      data: { profile_id: parseInt(profile_id), text: text.trim(), is_active: true }
    });
    res.json(trigger);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création trigger' });
  }
});

// PATCH /api/admin/verification-triggers/:id
router.patch('/verification-triggers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const trigger = await prisma.verificationTrigger.findFirst({ where: { id }, include: { profile: true } });
    if (!trigger || trigger.profile.account_id !== req.accountId) return res.status(403).json({ error: 'Accès refusé' });
    const updates = {};
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (req.body.text !== undefined) updates.text = req.body.text.trim();
    const updated = await prisma.verificationTrigger.update({ where: { id }, data: updates });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour trigger' });
  }
});

// DELETE /api/admin/verification-triggers/:id
router.delete('/verification-triggers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const trigger = await prisma.verificationTrigger.findFirst({ where: { id }, include: { profile: true } });
    if (!trigger || trigger.profile.account_id !== req.accountId) return res.status(403).json({ error: 'Accès refusé' });
    await prisma.verificationTrigger.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression trigger' });
  }
});

// ─────────────────────────────────────────────────────────────
// DRESSUR QUEUE — file d'attente WhatsApp dressur.site
// ─────────────────────────────────────────────────────────────

const DRESSUR_QUEUE_URL = 'https://dressur.site/crud/communication-mail/file-attente-whatsapp/json';

let dressurJob = {
  running: false,
  cancelled: false,
  accountId: null,
  profileId: null,
  total: 0,
  sent: 0,
  failed: 0,
  current: null,
  results: []
};

function emitDressurProgress() {
  if (whatsappManager.io && dressurJob.accountId) {
    whatsappManager.io.to(`account_${dressurJob.accountId}`).emit('dressur-progress', {
      running: dressurJob.running,
      cancelled: dressurJob.cancelled,
      sent: dressurJob.sent,
      failed: dressurJob.failed,
      total: dressurJob.total,
      current: dressurJob.current,
      results: dressurJob.results
    });
  }
}

// GET /api/admin/dressur-queue — fetch queue from dressur.site
router.get('/dressur-queue', async (req, res) => {
  try {
    const r = await axios.get(DRESSUR_QUEUE_URL, { timeout: 10000 });
    const items = Array.isArray(r.data) ? r.data : [];
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(502).json({ error: `Impossible de joindre dressur.site : ${err.message}` });
  }
});

// GET /api/admin/dressur-queue/status — current job state
router.get('/dressur-queue/status', (req, res) => {
  res.json({
    running: dressurJob.running,
    cancelled: dressurJob.cancelled,
    sent: dressurJob.sent,
    failed: dressurJob.failed,
    total: dressurJob.total,
    current: dressurJob.current,
    results: dressurJob.results
  });
});

// POST /api/admin/dressur-queue/start — launch sending
router.post('/dressur-queue/start', async (req, res) => {
  if (dressurJob.running) {
    return res.status(409).json({ error: 'Un envoi est déjà en cours' });
  }

  const { profileId, minDelay = 10, maxDelay = 30 } = req.body;
  if (!profileId) return res.status(400).json({ error: 'profileId requis' });

  const min = Math.max(1, Number(minDelay));
  const max = Math.max(min, Number(maxDelay));

  let items;
  try {
    const r = await axios.get(DRESSUR_QUEUE_URL, { timeout: 10000 });
    items = Array.isArray(r.data) ? r.data : [];
  } catch (err) {
    return res.status(502).json({ error: `Impossible de joindre dressur.site : ${err.message}` });
  }

  if (items.length === 0) {
    return res.status(400).json({ error: "La file d'attente est vide" });
  }

  dressurJob = {
    running: true,
    cancelled: false,
    accountId: req.accountId,
    profileId: parseInt(profileId),
    total: items.length,
    sent: 0,
    failed: 0,
    current: null,
    results: []
  };

  res.json({ success: true, total: items.length });

  // Async sending loop — runs after response is sent
  (async () => {
    for (let i = 0; i < items.length; i++) {
      if (dressurJob.cancelled) break;

      const { numero, message } = items[i];
      dressurJob.current = { numero, index: i + 1 };
      emitDressurProgress();

      try {
        const waId = String(numero).replace(/^\+/, '') + '@c.us';
        await whatsappManager.sendMessage(dressurJob.profileId, waId, message);
        dressurJob.sent++;
        dressurJob.results.push({
          numero,
          preview: String(message).slice(0, 80),
          status: 'sent',
          at: new Date().toISOString()
        });
      } catch (err) {
        dressurJob.failed++;
        dressurJob.results.push({
          numero,
          preview: String(message).slice(0, 80),
          status: 'failed',
          error: err.message,
          at: new Date().toISOString()
        });
      }

      emitDressurProgress();

      // Random delay between messages (skip after last one)
      if (!dressurJob.cancelled && i < items.length - 1) {
        const delayMs = (Math.random() * (max - min) + min) * 1000;
        await new Promise(resolve => {
          const timer = setTimeout(resolve, delayMs);
          const check = setInterval(() => {
            if (dressurJob.cancelled) { clearTimeout(timer); clearInterval(check); resolve(); }
          }, 200);
          setTimeout(() => clearInterval(check), delayMs + 500);
        });
      }
    }

    dressurJob.running = false;
    dressurJob.current = null;
    emitDressurProgress();
    if (whatsappManager.io && dressurJob.accountId) {
      whatsappManager.io.to(`account_${dressurJob.accountId}`).emit('dressur-done', {
        sent: dressurJob.sent,
        failed: dressurJob.failed,
        total: dressurJob.total
      });
    }
  })();
});

// POST /api/admin/dressur-queue/stop — cancel current job
router.post('/dressur-queue/stop', (req, res) => {
  if (!dressurJob.running) {
    return res.status(400).json({ error: 'Aucun envoi en cours' });
  }
  dressurJob.cancelled = true;
  dressurJob.running = false;
  emitDressurProgress();
  res.json({ success: true, sent: dressurJob.sent, failed: dressurJob.failed });
});

module.exports = router;
