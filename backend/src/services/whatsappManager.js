const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const messageHandler = require('./messageHandler');

class WhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.io = null;
    this.prisma = null;
  }

  setIO(io) { this.io = io; }
  setPrisma(prisma) { this.prisma = prisma; }

  initializeClient(accountId) {
    if (this.clients.has(accountId)) {
      const existing = this.clients.get(accountId);
      if (['initializing', 'connected', 'qr'].includes(existing.status)) return;
    }

    const sessionPath = path.join(__dirname, '../../.wwebjs_auth');

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: sessionPath
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ]
      }
    });

    this.clients.set(accountId, { client, status: 'initializing', qrCode: null });

    client.on('qr', (qr) => {
      console.log(`QR Code disponible — compte ${accountId}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.qrCode = qr; entry.status = 'qr'; }
      this.io?.to(`account_${accountId}`).emit('qr', qr);
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: qr, status: 'qr' });
    });

    client.on('ready', async () => {
      console.log(`WhatsApp prêt — compte ${accountId}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.qrCode = null; entry.status = 'connected'; }

      try {
        await this.prisma.whatsAppSession.upsert({
          where: { account_id: accountId },
          create: { account_id: accountId, is_connected: true },
          update: { is_connected: true }
        });
      } catch (err) {
        console.error('Erreur upsert session ready:', err.message);
      }

      this.io?.to(`account_${accountId}`).emit('ready', { status: 'connected' });
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: true, qrCode: null, status: 'connected' });
    });

    client.on('message', async (message) => {
      try {
        if (message.fromMe) return;

        await messageHandler.handleIncomingMessage(message, client, this.prisma, accountId);

        const contact = await message.getContact();
        const phoneNumber = '+' + (contact.number || contact.id.user);

        this.io?.to(`account_${accountId}`).emit('new-message', {
          from: phoneNumber,
          body: message.body,
          timestamp: message.timestamp
        });
      } catch (err) {
        console.error('Erreur traitement message entrant:', err.message);
      }
    });

    client.on('disconnected', async (reason) => {
      console.log(`Client ${accountId} déconnecté: ${reason}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.status = 'disconnected'; entry.qrCode = null; }

      try {
        await this.prisma.whatsAppSession.upsert({
          where: { account_id: accountId },
          create: { account_id: accountId, is_connected: false },
          update: { is_connected: false }
        });
      } catch (err) {
        console.error('Erreur upsert session disconnect:', err.message);
      }

      this.io?.to(`account_${accountId}`).emit('disconnected', { reason });
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: null, status: 'disconnected' });
      this.clients.delete(accountId);
    });

    client.on('auth_failure', (msg) => {
      console.error(`Auth failure — compte ${accountId}:`, msg);
      const entry = this.clients.get(accountId);
      if (entry) entry.status = 'auth_failure';
      this.io?.to(`account_${accountId}`).emit('auth_failure', { message: msg });
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: null, status: 'auth_failure' });
      this.clients.delete(accountId);
    });

    // Lancer l'initialisation de manière isolée — les erreurs ne crashent plus le serveur
    client.initialize().catch(err => {
      console.error(`Erreur initialisation WhatsApp ${accountId}:`, err.message);
      const entry = this.clients.get(accountId);
      if (entry) entry.status = 'error';
      this.io?.to(`account_${accountId}`).emit('auth_failure', { message: 'Erreur de connexion WhatsApp: ' + err.message });
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: null, status: 'error' });
      this.clients.delete(accountId);
    });
  }

  getStatus(accountId) {
    const entry = this.clients.get(accountId);
    if (!entry) return { isConnected: false, qrCode: null, status: 'not_initialized' };
    return {
      isConnected: entry.status === 'connected',
      qrCode: entry.qrCode,
      status: entry.status
    };
  }

  async sendMessage(accountId, to, content) {
    const entry = this.clients.get(accountId);
    if (!entry || entry.status !== 'connected') throw new Error('WhatsApp non connecté');
    await entry.client.sendMessage(to, content);
  }

  async logout(accountId) {
    const entry = this.clients.get(accountId);
    if (entry) {
      try {
        await entry.client.logout();
      } catch (err) {
        console.error('Erreur logout WhatsApp:', err.message);
      }
      this.clients.delete(accountId);
    }
  }

  async restoreExistingSessions() {
    try {
      const sessions = await this.prisma.whatsAppSession.findMany({
        where: { is_connected: true }
      });
      console.log(`Restauration de ${sessions.length} session(s) WhatsApp`);
      for (const session of sessions) {
        this.initializeClient(session.account_id);
      }
    } catch (err) {
      console.error('Erreur restauration sessions:', err.message);
    }
  }
}

module.exports = new WhatsAppManager();
