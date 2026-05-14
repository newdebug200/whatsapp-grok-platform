const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

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
        messages: { today: { sent: 0, received: 0 }, week: { sent: 0, received: 0 }, month: { sent: 0, received: 0 } },
        aiResponseRate: 0,
        dailyMessages: buildEmptyDays(7),
        topContacts: []
      });
    }

    const allMessages = await prisma.message.findMany({
      where: {
        contact_id: { in: contactIds },
        created_at: { gte: start30Days }
      },
      select: { direction: true, created_at: true, contact_id: true }
    });

    const countByPeriod = (msgs, since) => {
      const subset = msgs.filter(m => new Date(m.created_at) >= since);
      return {
        sent: subset.filter(m => m.direction === 'sent').length,
        received: subset.filter(m => m.direction === 'received').length
      };
    };

    const today = countByPeriod(allMessages, startOfToday);
    const week = countByPeriod(allMessages, start7Days);
    const month = countByPeriod(allMessages, start30Days);

    const aiResponseRate = week.received > 0
      ? Math.round((week.sent / week.received) * 100)
      : 0;

    const dailyMessages = buildEmptyDays(7);
    const weekMessages = allMessages.filter(m => new Date(m.created_at) >= start7Days);
    for (const msg of weekMessages) {
      const dateKey = new Date(msg.created_at).toISOString().slice(0, 10);
      const day = dailyMessages.find(d => d.date === dateKey);
      if (day) {
        if (msg.direction === 'sent') day.sent++;
        else if (msg.direction === 'received') day.received++;
      }
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
      aiResponseRate,
      dailyMessages,
      topContacts
    });
  } catch (error) {
    console.error('Erreur GET stats:', error);
    res.status(500).json({ error: error.message });
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
      sent: 0,
      received: 0
    });
  }
  return days;
}

module.exports = router;
