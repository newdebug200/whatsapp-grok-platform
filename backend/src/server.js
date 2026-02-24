const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const whatsappService = require('./services/whatsappService');
const messageRoutes = require('./routes/messageRoutes');
const faqRoutes = require('./routes/faqRoutes');
const configRoutes = require('./routes/configRoutes');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/messages', messageRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/config', configRoutes);

// Socket.io
require('./socket/socketHandler')(io, prisma);

// Initialisation WhatsApp
whatsappService.initialize(io, prisma);

server.listen(process.env.PORT || 3001, () => {
  console.log(`Serveur démarré sur port ${process.env.PORT || 3001}`);
});