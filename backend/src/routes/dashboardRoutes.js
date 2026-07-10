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

    const [
      unreadConversations,
      pausedContacts,
      pausedContactsList,
      sentimentAlerts,
      sentimentAlertsList,
      funnelCounts,
      messagesReceivedToday,
      messagesSentToday,
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
    ]);

    res.json({
      unreadConversations,
      pausedContacts,
      pausedContactsList,
      sentimentAlerts,
      sentimentAlertsList,
      funnelCounts,
      today: { received: messagesReceivedToday, sent: messagesSentToday },
    });
  } catch (error) {
    console.error('Erreur GET dashboard overview:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du tableau de bord' });
  }
});

module.exports = router;
