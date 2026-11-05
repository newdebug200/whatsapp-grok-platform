const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const { addMessageCount, createMessageCounts } = require('../services/messageStats');

router.use(authMiddleware);
router.use(profileMiddleware);

router.get('/', async (req, res) => {
  try {
    const profileId = req.profileId;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start7Days = new Date(startOfToday);
    start7Days.setDate(start7Days.getDate() - 6);
    const start30Days = new Date(startOfToday);
    start30Days.setDate(start30Days.getDate() - 29);

    const contacts = await prisma.contact.findMany({
      where: { profile_id: profileId },
      select: { id: true }
    });
    const contactIds = contacts.map(c => c.id);
    const totalContacts = contactIds.length;

    if (totalContacts === 0) {
      return res.json({
        totalContacts: 0,
        messages: { today: createMessageCounts(), week: createMessageCounts(), month: createMessageCounts() },
        dailyMessages: buildEmptyDays(7),
        topContacts: []
      });
    }

    const allMessages = await prisma.message.findMany({
      where: {
        contact_id: { in: contactIds },
        created_at: { gte: start30Days }
      },
      select: { direction: true, origin: true, created_at: true, contact_id: true }
    });

    const countByPeriod = (msgs, since) => {
      return msgs
        .filter(message => new Date(message.created_at) >= since)
        .reduce(addMessageCount, createMessageCounts());
    };

    const today = countByPeriod(allMessages, startOfToday);
    const week = countByPeriod(allMessages, start7Days);
    const month = countByPeriod(allMessages, start30Days);

    const dailyMessages = buildEmptyDays(7);
    const weekMessages = allMessages.filter(m => new Date(m.created_at) >= start7Days);
    for (const msg of weekMessages) {
      const dateKey = new Date(msg.created_at).toISOString().slice(0, 10);
      const day = dailyMessages.find(d => d.date === dateKey);
      if (day) addMessageCount(day, msg);
    }

    const contactMsgCount = {};
    for (const msg of weekMessages) {
      contactMsgCount[msg.contact_id] = (contactMsgCount[msg.contact_id] || 0) + 1;
    }

    const topContactIds = Object.entries(contactMsgCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => parseInt(id));

    const topContactData = await prisma.contact.findMany({
      where: { id: { in: topContactIds } },
      select: { id: true, name: true, phone_number: true }
    });

    const topContacts = topContactIds.map(id => {
      const c = topContactData.find(x => x.id === id);
      return c ? { ...c, count: contactMsgCount[id] } : null;
    }).filter(Boolean);

    res.json({
      totalContacts,
      messages: { today, week, month },
      dailyMessages,
      topContacts
    });
  } catch (error) {
    console.error('Erreur GET stats:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des statistiques' });
  }
});

function buildEmptyDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
      ...createMessageCounts()
    });
  }
  return days;
}

module.exports = router;
