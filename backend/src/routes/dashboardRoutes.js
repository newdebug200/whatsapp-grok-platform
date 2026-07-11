const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(profileMiddleware);

const FUNNEL_STAGES = ['prospect', 'interesse', 'client', 'fidele'];
const STAGE_LABELS = {
  prospect: 'Prospect',
  interesse: 'Intéressé',
  client: 'Client',
  fidele: 'Fidèle'
};
const NEGATIVE_SENTIMENTS = ['colere', 'negatif'];

// GET /api/dashboard/overview — lightweight aggregate for the admin dashboard home.
// Only counts + small "top N" lists are returned (no full contact/message payloads),
// so this stays fast even on accounts with a large contact base.
router.get('/overview', async (req, res) => {
  try {
    const profileId = req.profileId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const start7Days = new Date(startOfToday);
    start7Days.setDate(start7Days.getDate() - 6);

    const [
      unreadConversations,
      pausedContacts,
      pausedContactsList,
      sentimentAlerts,
      sentimentAlertsList,
      funnelCounts,
      messagesReceivedToday,
      messagesSentToday,
      totalContacts,
      weekMessages,
      topContactsRaw,
    ] = await Promise.all([
      prisma.contact.count({ where: { profile_id: profileId, archived: false, unread_count: { gt: 0 } } }),
      prisma.contact.count({ where: { profile_id: profileId, archived: false, ia_paused: true } }),
      prisma.contact.findMany({
        where: { profile_id: profileId, archived: false, ia_paused: true },
        select: { id: true, name: true, phone_number: true },
        orderBy: { id: 'desc' },
        take: 5,
      }),
      prisma.message.count({
        where: {
          sentiment: { in: NEGATIVE_SENTIMENTS },
          unread: true,
          contact: { profile_id: profileId, archived: false },
        },
      }),
      prisma.message.findMany({
        where: {
          sentiment: { in: NEGATIVE_SENTIMENTS },
          unread: true,
          contact: { profile_id: profileId, archived: false },
        },
        select: {
          id: true,
          content: true,
          sentiment: true,
          created_at: true,
          contact: { select: { id: true, name: true, phone_number: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      Promise.all(
        FUNNEL_STAGES.map(stage =>
          prisma.contact.count({ where: { profile_id: profileId, funnel_stage: stage, archived: false } })
            .then(count => ({ stage, label: STAGE_LABELS[stage], count }))
        )
      ),
      prisma.message.count({
        where: { direction: 'received', created_at: { gte: startOfToday }, contact: { profile_id: profileId } },
      }),
      prisma.message.count({
        where: { direction: 'sent', created_at: { gte: startOfToday }, contact: { profile_id: profileId } },
      }),
      prisma.contact.count({ where: { profile_id: profileId, archived: false } }),
      prisma.message.findMany({
        where: { created_at: { gte: start7Days }, contact: { profile_id: profileId, archived: false } },
        select: { direction: true, created_at: true, contact_id: true },
      }),
      prisma.message.groupBy({
        by: ['contact_id'],
        where: { created_at: { gte: start7Days }, contact: { profile_id: profileId, archived: false } },
        _count: { contact_id: true },
        orderBy: { _count: { contact_id: 'desc' } },
        take: 5,
      }),
    ]);

    // Small 7-day sparkline of message volume, same shape as the Statistiques page.
    const dailyMessages = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      dailyMessages.push({ date: dateKey, label: d.toLocaleDateString('fr-FR', { weekday: 'short' }), sent: 0, received: 0 });
    }
    for (const msg of weekMessages) {
      const dateKey = new Date(msg.created_at).toISOString().slice(0, 10);
      const day = dailyMessages.find(d => d.date === dateKey);
      if (day) {
        if (msg.direction === 'sent') day.sent++;
        else if (msg.direction === 'received') day.received++;
      }
    }

    const topContactIds = topContactsRaw.map(c => c.contact_id);
    const topContactData = topContactIds.length
      ? await prisma.contact.findMany({
          where: { id: { in: topContactIds } },
          select: { id: true, name: true, phone_number: true },
        })
      : [];
    const topContacts = topContactsRaw.map(c => {
      const contact = topContactData.find(x => x.id === c.contact_id);
      return contact ? { ...contact, count: c._count.contact_id } : null;
    }).filter(Boolean);

    res.json({
      unreadConversations,
      pausedContacts,
      pausedContactsList,
      sentimentAlerts,
      sentimentAlertsList,
      funnelCounts,
      today: { received: messagesReceivedToday, sent: messagesSentToday },
      totalContacts,
      dailyMessages,
      topContacts,
    });
  } catch (error) {
    console.error('Erreur GET dashboard overview:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du tableau de bord' });
  }
});

module.exports = router;
