const dotenv = require('dotenv');
dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('[Botora] Unhandled Rejection (non fatal):', reason?.message || reason);
});
process.on('uncaughtException', (error) => {
  console.error('[Botora] Uncaught Exception (non fatal):', error.message);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');

const whatsappManager = require('./services/whatsappManager');
const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutes');
const faqRoutes = require('./routes/faqRoutes');
const configRoutes = require('./routes/configRoutes');
const statsRoutes = require('./routes/statsRoutes');
const profileRoutes = require('./routes/profileRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
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

  socket.on('connect-whatsapp', () => {
    console.log(`Demande connexion WhatsApp — compte ${accountId}`);
    whatsappManager.initializeClient(accountId);
  });

  socket.on('get-initial-data', async (data = {}) => {
    try {
      let profileId = data?.profileId;

      if (!profileId) {
        const status = whatsappManager.getStatus(accountId);
        profileId = status.profileId;
      }

      if (!profileId) {
        socket.emit('initial-contacts', []);
        return;
      }

      const profile = await prisma.whatsAppProfile.findFirst({
        where: { id: profileId, account_id: accountId }
      });
      if (!profile) {
        socket.emit('initial-contacts', []);
        return;
      }

      const contacts = await prisma.contact.findMany({
        where: { profile_id: profileId },
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Botora Backend démarré sur port ${PORT}`);

  await whatsappManager.restoreExistingSessions();
});
