const dotenv = require('dotenv');
dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('[Botora] Unhandled Rejection:', reason?.message || reason);
});
process.on('uncaughtException', (error) => {
  console.error('[Botora] Uncaught Exception:', error.message);
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('[Botora] Module manquant — relancez npm install');
  }
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { JWT_SECRET } = require('./middleware/auth');
const { subscriptionAccessMiddleware } = require('./middleware/subscriptionAccess');

const whatsappManager = require('./services/whatsappManager');
const centralSync = require('./services/centralSync');
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
const statusRoutes = require('./routes/statusRoutes');
const funnelRoutes = require('./routes/funnelRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminCentralRoutes = require('./routes/adminCentralRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const apiSendRoutes = require('./routes/apiSendRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});

const prisma = new PrismaClient();

app.use(cors());
// FedaPay signatures require the exact raw JSON body.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api', subscriptionAccessMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/v1', apiSendRoutes);
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
app.use('/api/statuses', statusRoutes);
app.use('/api/funnel', funnelRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin-central', adminCentralRoutes);

app.get('/api/healthz', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.get('/api/central-health', async (_req, res) => {
  try {
    const centralSync = require('./services/centralSync');
    const result = await centralSync.checkHealth();
    res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

async function checkSocketAccess(accountId) {
  const account = await prisma.account.findUnique({ where: { id: Number(accountId) }, select: { email: true } });
  if (!account?.email) return { allowed: false, access_type: 'expired' };
  const central = await centralSync.getAccount(account.email);
  if (!central) return { allowed: true };
  return { allowed: central.access_allowed !== false, access_type: central.access_type || 'expired', access_ends_at: central.access_ends_at || null };
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.accountId = decoded.accountId;
    const access = await checkSocketAccess(socket.accountId);
    if (!access.allowed) {
      const error = new Error('SUBSCRIPTION_REQUIRED');
      error.data = access;
      return next(error);
    }
    next();
  } catch (err) {
    if (err.message === 'SUBSCRIPTION_REQUIRED') return next(err);
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const accountId = socket.accountId;
  console.log(`Socket connecté — compte ${accountId} (${socket.id})`);
  socket.join(`account_${accountId}`);
  const accessInterval = setInterval(async () => {
    try {
      const access = await checkSocketAccess(accountId);
      if (!access.allowed) {
        socket.emit('subscription-required', access);
        socket.disconnect(true);
      }
    } catch (_) {}
  }, 60000);

  socket.on('get-status', () => {
    const status = whatsappManager.getStatus(accountId);
    socket.emit('status', status);
  });

  socket.on('resync-whatsapp', async (data = {}) => {
    const profileId = data?.profileId ? Number(data.profileId) : null;
    if (!profileId) {
      socket.emit('status', { status: 'error', message: 'Profil WhatsApp requis pour relancer la synchronisation.' });
      return;
    }
    console.log(`Demande resynchronisation WhatsApp — compte ${accountId}, profil ${profileId}`);
    try {
      await whatsappManager.reconnectClient(accountId, profileId);
    } catch (err) {
      console.error('Erreur resynchronisation WhatsApp:', err.message);
      socket.emit('status', { isConnected: false, qrCode: null, status: 'error', profileId, message: 'Impossible de relancer la synchronisation. Réessayez.' });
    }
  });

  socket.on('connect-whatsapp', (data = {}) => {
    const profileId = data?.profileId ? Number(data.profileId) : null;
    if (profileId) {
      // Reconnexion d'un numéro existant : ne bloquer que si CE profil est déjà actif.
      const current = whatsappManager.getProfileStatus(profileId);
      if (['connected', 'initializing', 'qr'].includes(current.status)) {
        socket.emit('status', { ...current, profileId });
        return;
      }
    } else {
      // Ajout d'un nouveau numéro : ne bloquer que s'il y a déjà une autre
      // tentative d'ajout en cours. Un numéro déjà connecté ne doit pas bloquer.
      const pendingNew = whatsappManager.getPendingNewConnection(accountId);
      if (pendingNew) {
        socket.emit('status', pendingNew);
        return;
      }
    }
    console.log(`Demande connexion WhatsApp — compte ${accountId}${profileId ? `, profil ${profileId}` : ' (nouveau)'}`);
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
      const enrichedContacts = await whatsappManager.enrichConversationContacts(profileId, contacts);
      enrichedContacts.sort((a, b) => {
        const dateA = a.messages?.[0]?.created_at || a.created_at;
        const dateB = b.messages?.[0]?.created_at || b.created_at;
        return new Date(dateB) - new Date(dateA);
      });
      socket.emit('initial-contacts', enrichedContacts);
    } catch (error) {
      console.error('Erreur get-initial-data:', error.message);
      socket.emit('initial-contacts', []);
    }
  });

  socket.on('disconnect', () => {
    clearInterval(accessInterval);
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
const GROQ_PLACEHOLDERS = new Set(['your_groq_api_key_here', 'your-groq-api-key', 'gsk_xxxx', 'votre_clé_groq', 'your_grok_api_key', 'changeme']);
const isPlaceholder = !GROQ_KEY || GROQ_KEY.trim().length < 20 || GROQ_PLACEHOLDERS.has(GROQ_KEY.trim().toLowerCase());
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
