const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const messageHandler = require('./messageHandler');

// Délai minimum entre deux tentatives d'initialisation (ms)
const REINIT_COOLDOWN_MS = 8000;

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
      // Bloquer si déjà en cours / connecté / QR affiché
      if (['initializing', 'connected', 'qr'].includes(existing.status)) {
        console.log(`[WA] Initialisation ignorée — état actuel: ${existing.status} (compte ${accountId})`);
        return;
      }
      // Cooldown après une erreur : éviter le spam de reconnexion
      if (existing.lastErrorAt && Date.now() - existing.lastErrorAt < REINIT_COOLDOWN_MS) {
        const remaining = Math.ceil((REINIT_COOLDOWN_MS - (Date.now() - existing.lastErrorAt)) / 1000);
        console.log(`[WA] Cooldown actif — réessai dans ${remaining}s (compte ${accountId})`);
        this.io?.to(`account_${accountId}`).emit('status', {
          isConnected: false, qrCode: null, status: 'cooldown',
          message: `Veuillez patienter ${remaining}s avant de réessayer`
        });
        return;
      }
    }

    const sessionPath = path.join(__dirname, '../../.wwebjs_auth');

    // Détecter la plateforme : --single-process et --no-zygote crashent sur Windows
    const isWindows = process.platform === 'win32';
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];
    // Ces flags ne fonctionnent que sous Linux (crashent sous Windows avec "frame was detached")
    if (!isWindows) {
      puppeteerArgs.push('--no-zygote', '--single-process');
    }

    console.log(`[WA] Initialisation compte ${accountId} (plateforme: ${process.platform})`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: sessionPath
      }),
      puppeteer: {
        headless: true,
        args: puppeteerArgs
      }
    });

    this.clients.set(accountId, { client, status: 'initializing', qrCode: null, lastErrorAt: null });

    client.on('qr', (qr) => {
      console.log(`[WA] QR Code disponible — compte ${accountId}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.qrCode = qr; entry.status = 'qr'; }
      this.io?.to(`account_${accountId}`).emit('qr', qr);
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: qr, status: 'qr' });
    });

    client.on('ready', async () => {
      console.log(`[WA] Prêt — compte ${accountId}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.qrCode = null; entry.status = 'connected'; entry.lastErrorAt = null; }

      try {
        await this.prisma.whatsAppSession.upsert({
          where: { account_id: accountId },
          create: { account_id: accountId, is_connected: true },
          update: { is_connected: true }
        });
      } catch (err) {
        console.error('[WA] Erreur upsert session ready:', err.message);
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
          from: phoneNumber, body: message.body, timestamp: message.timestamp
        });
      } catch (err) {
        console.error('[WA] Erreur message entrant:', err.message);
      }
    });

    client.on('disconnected', async (reason) => {
      console.log(`[WA] Déconnecté — compte ${accountId}: ${reason}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.status = 'disconnected'; entry.qrCode = null; }

      try {
        await this.prisma.whatsAppSession.upsert({
          where: { account_id: accountId },
          create: { account_id: accountId, is_connected: false },
          update: { is_connected: false }
        });
      } catch (err) {
        console.error('[WA] Erreur upsert session disconnect:', err.message);
      }

      this.io?.to(`account_${accountId}`).emit('disconnected', { reason });
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: null, status: 'disconnected' });
      this.clients.delete(accountId);
    });

    client.on('auth_failure', (msg) => {
      console.error(`[WA] Auth failure — compte ${accountId}:`, msg);
      const entry = this.clients.get(accountId);
      if (entry) { entry.status = 'auth_failure'; entry.lastErrorAt = Date.now(); }
      this.io?.to(`account_${accountId}`).emit('auth_failure', { message: msg });
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: null, status: 'auth_failure' });
      this.clients.delete(accountId);
    });

    client.initialize().catch(err => {
      console.error(`[WA] Erreur initialisation compte ${accountId}:`, err.message);
      const entry = this.clients.get(accountId);
      const errMsg = err.message || 'Erreur inconnue';
      const isFrameDetached = errMsg.includes('frame was detached') || errMsg.includes('Navigating frame');

      if (entry) {
        entry.status = 'error';
        entry.lastErrorAt = Date.now();
      }

      const userMessage = isFrameDetached
        ? 'Chrome ne démarre pas correctement. Assurez-vous que Google Chrome est installé, puis réessayez.'
        : `Erreur de connexion: ${errMsg}`;

      this.io?.to(`account_${accountId}`).emit('auth_failure', { message: userMessage });
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'error', message: userMessage
      });

      // Supprimer le client de la map après l'avoir marqué en erreur
      // (garder l'entrée qqs secondes pour le cooldown, puis supprimer)
      setTimeout(() => {
        const e = this.clients.get(accountId);
        if (e?.status === 'error') this.clients.delete(accountId);
      }, REINIT_COOLDOWN_MS);
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
      try { await entry.client.logout(); } catch (err) {
        console.error('[WA] Erreur logout:', err.message);
      }
      this.clients.delete(accountId);
    }
    // Supprimer la session locale pour forcer un nouveau QR au prochain démarrage
    const sessionDir = path.join(__dirname, `../../.wwebjs_auth/session-account_${accountId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[WA] Session locale supprimée — compte ${accountId}`);
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
      console.error('[WA] Erreur restauration sessions:', err.message);
    }
  }
}

module.exports = new WhatsAppManager();
