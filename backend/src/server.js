const dotenv = require('dotenv');
dotenv.config();

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
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

app.get('/api/healthz', (req, res) => res.json({ status: 'ok' }));

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
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
  console.log(`Socket connecté pour compte ${accountId}:`, socket.id);

  socket.join(`account_${accountId}`);

  socket.on('get-status', () => {
    const status = whatsappManager.getStatus(accountId);
    socket.emit('status', status);
  });

  socket.on('connect-whatsapp', () => {
    console.log(`Demande de connexion WhatsApp pour compte ${accountId}`);
    whatsappManager.initializeClient(accountId);
  });

  socket.on('get-initial-data', async () => {
    try {
      const contacts = await prisma.contact.findMany({
        where: { account_id: accountId },
        include: {
          messages: {
            orderBy: { created_at: 'desc' },
            take: 1
          }
        },
        orderBy: { created_at: 'desc' }
      });
      socket.emit('initial-contacts', contacts);
    } catch (error) {
      console.error('Erreur get-initial-data:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket déconnecté pour compte ${accountId}:`, socket.id);
  });
});

whatsappManager.setIO(io);
whatsappManager.setPrisma(prisma);

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Botora Backend démarré sur port ${PORT}`);
  await whatsappManager.restoreExistingSessions();
});
