const express = require('express');
const fs = require('fs');
const path = require('path');
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
const NEGATIVE_SENTIMENTS = ['colere', 'negatif', 'frustre', 'inquiet', 'confus', 'urgent'];
const SENTIMENT_CATEGORIES = ['positif', 'neutre', 'negatif', 'colere', 'satisfait', 'frustre', 'inquiet', 'confus', 'reconnaissant', 'urgent'];

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

// GET /api/dashboard/sentiments — dedicated sentiment treatment workspace.
router.get('/sentiments', async (req, res) => {
  try {
    const profileId = req.profileId;
    const requestedFilter = req.query.filter || 'negative';
    const filterSentiments = {
      negative: NEGATIVE_SENTIMENTS,
      angry: ['colere'],
      frustrated: ['frustre'],
      worried: ['inquiet'],
      confused: ['confus'],
      urgent: ['urgent'],
    };
    const selectedSentiments = requestedFilter === 'all' ? SENTIMENT_CATEGORIES : (filterSentiments[requestedFilter] || NEGATIVE_SENTIMENTS);
    const where = {
      contact: { profile_id: profileId, archived: false },
      sentiment: { in: selectedSentiments },
      ...(req.query.unread !== 'false' ? { unread: true } : {}),
    };
    const [messages, counts] = await Promise.all([
      prisma.message.findMany({
        where,
        select: {
          id: true, content: true, sentiment: true, unread: true, created_at: true,
          contact: { select: { id: true, name: true, phone_number: true, ia_paused: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
      prisma.message.groupBy({
        by: ['sentiment'],
        where: { contact: { profile_id: profileId, archived: false }, sentiment: { in: SENTIMENT_CATEGORIES } },
        _count: { _all: true },
      }),
    ]);
    const countMap = Object.fromEntries(counts.map(item => [item.sentiment, item._count._all]));
    const categoryCounts = Object.fromEntries(SENTIMENT_CATEGORIES.map(category => [category, countMap[category] || 0]));
    res.json({ messages, counts: { ...categoryCounts, all: SENTIMENT_CATEGORIES.reduce((sum, category) => sum + categoryCounts[category], 0), priority: NEGATIVE_SENTIMENTS.reduce((sum, category) => sum + categoryCounts[category], 0) } });
  } catch (error) {
    console.error('Erreur GET dashboard sentiments:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des sentiments' });
  }
});

const uploadsDirectory = path.join(__dirname, '../../uploads');
const getFileSize = (filename) => {
  try { return fs.statSync(path.join(uploadsDirectory, path.basename(filename))).size; } catch (_) { return 0; }
};

// GET /api/dashboard/storage — storage items that can be cleaned for the active profile.
router.get('/storage', async (req, res) => {
  try {
    const profileId = req.profileId;
    const [messageMedia, campaignMedia, queueCount, archivedMessages] = await Promise.all([
      prisma.message.findMany({ where: { contact: { profile_id: profileId }, media_path: { not: null } }, select: { media_path: true } }),
      prisma.campaignMessage.findMany({ where: { campaign: { profile_id: profileId }, media_path: { not: null } }, select: { media_path: true } }),
      prisma.dressurQueueItem.count({ where: { profile_id: profileId } }),
      prisma.message.count({ where: { contact: { profile_id: profileId, archived: true } } }),
    ]);
    const mediaFiles = [...messageMedia, ...campaignMedia].map(item => item.media_path).filter(Boolean);
    const uniqueMedia = [...new Set(mediaFiles)];
    res.json({
      media: { files: uniqueMedia.length, bytes: uniqueMedia.reduce((sum, filename) => sum + getFileSize(filename), 0) },
      localQueue: { items: queueCount },
      archivedMessages: { items: archivedMessages },
    });
  } catch (error) {
    console.error('Erreur GET dashboard storage:', error);
    res.status(500).json({ error: 'Erreur lors du calcul du stockage' });
  }
});

// DELETE /api/dashboard/storage/:kind — destructive cleanup, scoped to the active profile.
router.delete('/storage/:kind', async (req, res) => {
  try {
    const profileId = req.profileId;
    const { kind } = req.params;
    if (kind === 'media') {
      const [messageMedia, campaignMedia] = await Promise.all([
        prisma.message.findMany({ where: { contact: { profile_id: profileId }, media_path: { not: null } }, select: { media_path: true } }),
        prisma.campaignMessage.findMany({ where: { campaign: { profile_id: profileId }, media_path: { not: null } }, select: { media_path: true } }),
      ]);
      const filenames = [...new Set([...messageMedia, ...campaignMedia].map(item => item.media_path).filter(Boolean))];
      for (const filename of filenames) {
        try { fs.unlinkSync(path.join(uploadsDirectory, path.basename(filename))); } catch (_) {}
      }
      await Promise.all([
        prisma.message.updateMany({ where: { contact: { profile_id: profileId }, media_path: { not: null } }, data: { media_path: null } }),
        prisma.campaignMessage.updateMany({ where: { campaign: { profile_id: profileId }, media_path: { not: null } }, data: { media_path: null } }),
      ]);
      return res.json({ ok: true, deleted: filenames.length });
    }
    if (kind === 'local-queue') {
      const result = await prisma.dressurQueueItem.deleteMany({ where: { profile_id: profileId } });
      return res.json({ ok: true, deleted: result.count });
    }
    if (kind === 'archived-messages') {
      const result = await prisma.message.deleteMany({ where: { contact: { profile_id: profileId, archived: true } } });
      return res.json({ ok: true, deleted: result.count });
    }
    return res.status(400).json({ error: 'Type de nettoyage inconnu' });
  } catch (error) {
    console.error('Erreur DELETE dashboard storage:', error);
    res.status(500).json({ error: 'Erreur lors du nettoyage' });
  }
});

module.exports = router;
