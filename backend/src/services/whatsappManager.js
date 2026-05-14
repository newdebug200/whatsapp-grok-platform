const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const messageHandler = require('./messageHandler');

const REINIT_COOLDOWN_MS = 10000;
const SESSION_BASE = path.join(__dirname, '../../.wwebjs_auth');

class WhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.io = null;
    this.prisma = null;
  }

  setIO(io) { this.io = io; }
  setPrisma(prisma) { this.prisma = prisma; }

  _cleanChromeLocks(accountId) {
    const sessionDir = path.join(SESSION_BASE, `session-account_${accountId}`);
    if (!fs.existsSync(sessionDir)) return;

    const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    const searchDirs = [sessionDir, path.join(sessionDir, 'Default')];

    for (const dir of searchDirs) {
      for (const lock of lockNames) {
        const p = path.join(dir, lock);
        try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`[WA] Verrou supprimé: ${p}`); } } catch (_) {}
      }
    }
  }

  _killOrphanChrome(accountId) {
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' });
      } else {
        execSync(`pkill -f "session-account_${accountId}" 2>/dev/null || true`, { stdio: 'ignore' });
      }
    } catch (_) {}
  }

  async _destroyExisting(accountId) {
    const entry = this.clients.get(accountId);
    if (!entry) return;
    try {
      await entry.client.destroy();
    } catch (_) {}
    this.clients.delete(accountId);
  }

  async initializeClient(accountId) {
    if (this.clients.has(accountId)) {
      const existing = this.clients.get(accountId);

      if (['initializing', 'connected', 'qr'].includes(existing.status)) {
        console.log(`[WA] Déjà en cours (${existing.status}) — compte ${accountId}`);
        return;
      }

      if (existing.lastErrorAt && Date.now() - existing.lastErrorAt < REINIT_COOLDOWN_MS) {
        const remaining = Math.ceil((REINIT_COOLDOWN_MS - (Date.now() - existing.lastErrorAt)) / 1000);
        console.log(`[WA] Cooldown ${remaining}s — compte ${accountId}`);
        this.io?.to(`account_${accountId}`).emit('status', {
          isConnected: false, qrCode: null, status: 'cooldown',
          message: `Patientez ${remaining}s avant de réessayer`
        });
        return;
      }

      await this._destroyExisting(accountId);
    }

    this._cleanChromeLocks(accountId);

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
      '--disable-features=TranslateUI',
    ];
    if (!isWindows) {
      puppeteerArgs.push('--no-zygote', '--single-process');
    }

    console.log(`[WA] Initialisation compte ${accountId} (${process.platform})`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: SESSION_BASE
      }),
      puppeteer: {
        headless: true,
        args: puppeteerArgs
      }
    });

    this.clients.set(accountId, {
      client,
      status: 'initializing',
      qrCode: null,
      lastErrorAt: null,
      profileId: null,
      phoneNumber: null
    });

    client.on('qr', (qr) => {
      console.log(`[WA] QR Code — compte ${accountId}`);
      const entry = this.clients.get(accountId);
      if (entry) { entry.qrCode = qr; entry.status = 'qr'; }
      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: qr, status: 'qr' });
    });

    client.on('ready', async () => {
      console.log(`[WA] Connecté — compte ${accountId}`);

      const phoneNumber = '+' + client.info.wid.user;

      let profile;
      try {
        profile = await this.prisma.whatsAppProfile.upsert({
          where: { account_id_phone_number: { account_id: accountId, phone_number: phoneNumber } },
          create: { account_id: accountId, phone_number: phoneNumber, is_connected: true },
          update: { is_connected: true }
        });
      } catch (err) {
        console.error('[WA] Erreur création profil:', err.message);
        return;
      }

      const entry = this.clients.get(accountId);
      if (entry) {
        entry.qrCode = null;
        entry.status = 'connected';
        entry.lastErrorAt = null;
        entry.profileId = profile.id;
        entry.phoneNumber = phoneNumber;
      }

      this.io?.to(`account_${accountId}`).emit('profile-ready', {
        id: profile.id,
        phone_number: profile.phone_number,
        display_name: profile.display_name,
        is_connected: true
      });

      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: true,
        qrCode: null,
        status: 'connected',
        profileId: profile.id,
        phoneNumber: profile.phone_number
      });
    });

    client.on('message', async (message) => {
      try {
        if (message.fromMe) return;
        const entry = this.clients.get(accountId);
        if (!entry?.profileId) return;

        await messageHandler.handleIncomingMessage(message, client, this.prisma, entry.profileId);

        const contact = await message.getContact();
        const phoneNumber = '+' + (contact.number || contact.id.user);
        this.io?.to(`account_${accountId}`).emit('new-message', {
          from: phoneNumber, body: message.body, timestamp: message.timestamp,
          profileId: entry.profileId
        });
      } catch (err) {
        console.error('[WA] Erreur message:', err.message);
      }
    });

    client.on('disconnected', async (reason) => {
      console.log(`[WA] Déconnecté — compte ${accountId}: ${reason}`);
      const entry = this.clients.get(accountId);

      if (entry?.profileId) {
        try {
          await this.prisma.whatsAppProfile.update({
            where: { id: entry.profileId },
            data: { is_connected: false }
          });
        } catch (err) {
          console.error('[WA] Erreur DB disconnect:', err.message);
        }
      }

      if (entry) { entry.status = 'disconnected'; entry.qrCode = null; }

      this.io?.to(`account_${accountId}`).emit('status', { isConnected: false, qrCode: null, status: 'disconnected' });
      this.clients.delete(accountId);
    });

    client.on('auth_failure', (msg) => {
      console.error(`[WA] Auth failure — compte ${accountId}:`, msg);
      const entry = this.clients.get(accountId);
      if (entry) { entry.status = 'auth_failure'; entry.lastErrorAt = Date.now(); }
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'auth_failure',
        message: 'Authentification refusée. Réessayez en scannant le QR code.'
      });
      client.destroy().catch(() => {});
      this.clients.delete(accountId);
    });

    client.initialize().catch(async (err) => {
      console.error(`[WA] Erreur initialisation compte ${accountId}:`, err.message);

      try { await client.destroy(); } catch (_) {}
      this._cleanChromeLocks(accountId);

      const entry = this.clients.get(accountId);
      if (entry) {
        entry.status = 'error';
        entry.lastErrorAt = Date.now();
      }

      const isBrowserLocked = err.message?.includes('already running') || err.message?.includes('userDataDir');
      const isContextDestroyed = err.message?.includes('context was destroyed') || err.message?.includes('Navigating frame');

      let userMessage;
      if (isBrowserLocked) {
        userMessage = 'Un Chrome précédent bloquait la session — il a été nettoyé. Cliquez "Réessayer" dans quelques secondes.';
      } else if (isContextDestroyed) {
        userMessage = 'Chrome a démarré mais a planté. Vérifiez que Google Chrome est bien installé et réessayez.';
      } else {
        userMessage = `Erreur WhatsApp: ${err.message}`;
      }

      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'error', message: userMessage
      });

      setTimeout(() => {
        const e = this.clients.get(accountId);
        if (e?.status === 'error') this.clients.delete(accountId);
      }, REINIT_COOLDOWN_MS);
    });
  }

  getStatus(accountId) {
    const entry = this.clients.get(accountId);
    if (!entry) return { isConnected: false, qrCode: null, status: 'not_initialized', profileId: null, phoneNumber: null };
    return {
      isConnected: entry.status === 'connected',
      qrCode: entry.qrCode,
      status: entry.status,
      profileId: entry.profileId || null,
      phoneNumber: entry.phoneNumber || null
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
      if (entry.profileId) {
        try {
          await this.prisma.whatsAppProfile.update({
            where: { id: entry.profileId },
            data: { is_connected: false }
          });
        } catch (_) {}
      }
      try { await entry.client.logout(); } catch (_) {}
      try { await entry.client.destroy(); } catch (_) {}
      this.clients.delete(accountId);
    }
    const sessionDir = path.join(SESSION_BASE, `session-account_${accountId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[WA] Session supprimée — compte ${accountId}`);
    }
  }

  async restoreExistingSessions() {
    try {
      const profiles = await this.prisma.whatsAppProfile.findMany({
        where: { is_connected: true }
      });
      console.log(`Restauration de ${profiles.length} session(s) WhatsApp`);
      for (const profile of profiles) {
        this._cleanChromeLocks(profile.account_id);
        await this.initializeClient(profile.account_id);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error('[WA] Erreur restauration sessions:', err.message);
    }
  }
}

module.exports = new WhatsAppManager();
