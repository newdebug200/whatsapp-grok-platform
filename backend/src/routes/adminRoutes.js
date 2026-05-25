const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(adminMiddleware);

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

    await prisma.account.delete({ where: { id: targetId } });

    res.json({ success: true, message: `Compte de ${target.name} supprimé` });
  } catch (error) {
    console.error('Erreur DELETE admin/users/:id:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

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

module.exports = router;
