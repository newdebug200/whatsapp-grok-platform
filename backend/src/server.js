const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { JWT_SECRET } = require('./middleware/auth');

const whatsappManager = require('./services/whatsappManager');
const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutes');
const faqRoutes = require('./routes/faqRoutes');
const configRoutes = require('./routes/configRoutes');
const statsRoutes = require('./routes/statsRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');
const broadcastRoutes = require('./routes/broadcastRoutes');
const tagRoutes = require('./routes/tagRoutes');
const quickReplyRoutes = require('./routes/quickReplyRoutes');
const platformConfigRoutes = require('./routes/platformConfigRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/config', configRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/quick-replies', quickReplyRoutes);
app.use('/api/platform-config', platformConfigRoutes);

app.get('/api/healthz', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.accountId = decoded.accountId;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const accountId = socket.accountId;
  console.log(`Socket connecté — compte ${accountId} (${socket.id})`);
  socket.join(`account_${accountId}`);

  socket.on('get-status', () => {
    const status = whatsappManager.getStatus(accountId);
    socket.emit('status', status);
  });

  socket.on('connect-whatsapp', (data = {}) => {
    const profileId = data?.profileId ? Number(data.profileId) : null;
    const current = whatsappManager.getStatus(accountId);
    if (['connected', 'initializing', 'qr'].includes(current.status)) {
      socket.emit('status', current);
      return;
    }
    whatsappManager.initializeClient(accountId, profileId);
  });

  socket.on('get-initial-data', async (data = {}) => {
    try {
      let profileId = data?.profileId ? Number(data.profileId) : null;
      if (!profileId) {
        const status = whatsappManager.getStatus(accountId);
        profileId = status.profileId;
      }
      if (!profileId) { socket.emit('initial-contacts', []); return; }
      const profile = await prisma.whatsAppProfile.findFirst({
        where: { id: profileId, account_id: accountId }
      });
      if (!profile) { socket.emit('initial-contacts', []); return; }
      const contacts = await prisma.contact.findMany({
        where: { profile_id: profileId, messages: { some: {} } },
        include: { messages: { orderBy: { created_at: 'desc' }, take: 1 } },
        orderBy: { created_at: 'desc' }
      });
      socket.emit('initial-contacts', contacts);
    } catch (error) {
      console.error('Erreur get-initial-data:', error.message);
      socket.emit('initial-contacts', []);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket déconnecté — compte ${accountId} (${socket.id})`);
  });
});

whatsappManager.setIO(io);
whatsappManager.setPrisma(prisma);

// ── Cron : vérification des campagnes planifiées (chaque minute) ──
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const scheduled = await prisma.campaign.findMany({
      where: { status: 'scheduled', scheduled_at: { lte: now } },
      include: { profile: true }
    });

    for (const campaign of scheduled) {
      const waStatus = whatsappManager.getStatus(campaign.profile.account_id);
      if (!waStatus.isConnected) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'cancelled' }
        });
        console.log(`[Cron] Campagne ${campaign.id} "${campaign.name}" annulée — WhatsApp non connecté`);
        continue;
      }
      try {
        whatsappManager.startCampaign(campaign.id, campaign.profile_id);
        console.log(`[Cron] Campagne ${campaign.id} "${campaign.name}" démarrée automatiquement`);
      } catch (err) {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'cancelled' } });
        console.error(`[Cron] Erreur démarrage campagne ${campaign.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Erreur vérification campagnes planifiées:', err.message);
  }
});

// ── Validation de la clé API Groq au démarrage ──────────────────────────────
const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
const GROQ_PLACEHOLDERS = ['your_groq_api_key_here', 'your-groq-api-key', 'gsk_xxxx', 'votre_clé_groq', ''];
const isPlaceholder = !GROQ_KEY || GROQ_PLACEHOLDERS.some(p => GROQ_KEY.toLowerCase().includes(p.toLowerCase()) || GROQ_KEY === p);
if (isPlaceholder) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║  ⚠️  ATTENTION : Clé API Groq non configurée                    ║');
  console.error('║                                                                  ║');
  console.error('║  Le bot IA ne pourra PAS répondre aux messages WhatsApp.         ║');
  console.error('║                                                                  ║');
  console.error('║  Solution :                                                      ║');
  console.error('║  1. Obtenez une clé gratuite sur https://console.groq.com/keys  ║');
  console.error('║  2. Ouvrez backend\\.env                                          ║');
  console.error('║  3. Remplacez GROK_API_KEY=... par votre vraie clé              ║');
  console.error('║  4. Redémarrez le backend                                        ║');
  console.error('╚══════════════════════════════════════════════════════════════════╝');
  console.error('');
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Botora Backend démarré sur port ${PORT}`);
  await whatsappManager.restoreExistingSessions();
});

process.on('unhandledRejection', (reason) => {
  console.error('[Botora] Unhandled Rejection:', reason?.message || reason);
});
process.on('uncaughtException', (error) => {
  console.error('[Botora] Uncaught Exception:', error.message);
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('[Botora] Module manquant — relancez npm install');
  }
});
