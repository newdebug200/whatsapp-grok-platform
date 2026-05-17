const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const messageHandler = require('./messageHandler');

const REINIT_COOLDOWN_MS = 10000;
const SESSION_BASE = path.join(__dirname, '../../.wwebjs_auth');
const CONTEXT_MAX = 20;

class WhatsAppManager {
  constructor() {
    // Key: profileId (number) or temp string "tmp_accountId_timestamp" before phone known
    this.clients = new Map();
    // In-memory context cache for Groq: key = `${profileId}_${contactId}`
    this.contextCache = new Map();
    this.io = null;
    this.prisma = null;
  }

  setIO(io) { this.io = io; }
  setPrisma(prisma) { this.prisma = prisma; }

  // ─── Context cache helpers ────────────────────────────────────────────────

  addToCache(profileId, contactId, direction, content) {
    const key = `${profileId}_${contactId}`;
    if (!this.contextCache.has(key)) this.contextCache.set(key, []);
    const cache = this.contextCache.get(key);
    cache.push({ direction, content, created_at: new Date() });
    if (cache.length > CONTEXT_MAX) cache.splice(0, cache.length - CONTEXT_MAX);
  }

  getFromCache(profileId, contactId) {
    return this.contextCache.get(`${profileId}_${contactId}`) || [];
  }

  clearCache(profileId) {
    for (const key of this.contextCache.keys()) {
      if (key.startsWith(`${profileId}_`)) this.contextCache.delete(key);
    }
  }

  emitToProfileAccount(profileId, event, data) {
    const found = this._getEntryByProfileId(profileId);
    const accountId = found?.entry?.accountId;
    if (accountId && this.io) {
      this.io.to(`account_${accountId}`).emit(event, data);
    }
  }

  // ─── Client lookup helpers ────────────────────────────────────────────────

  _getEntryByProfileId(profileId) {
    for (const [key, entry] of this.clients) {
      if (entry.profileId === profileId) return { key, entry };
    }
    return null;
  }

  _getEntriesForAccount(accountId) {
    const results = [];
    for (const [key, entry] of this.clients) {
      if (entry.accountId === accountId) results.push({ key, entry });
    }
    return results;
  }

  _tempKey(accountId) {
    return `tmp_${accountId}_${Date.now()}`;
  }

  // ─── Chrome helpers ───────────────────────────────────────────────────────

  _sessionId(clientKey) {
    return typeof clientKey === 'number' ? `profile_${clientKey}` : clientKey;
  }

  _cleanChromeLocks(clientKey) {
    const sessionDir = path.join(SESSION_BASE, `session-${this._sessionId(clientKey)}`);
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

  _killOrphanChrome() {
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' });
      } else {
        execSync('pkill -f "wwebjs" 2>/dev/null || true', { stdio: 'ignore' });
      }
    } catch (_) {}
  }

  async _destroyEntry(key) {
    const entry = this.clients.get(key);
    if (!entry) return;
    try { await entry.client.destroy(); } catch (_) {}
    this.clients.delete(key);
  }

  // ─── Main: initialize a WhatsApp client ──────────────────────────────────

  /**
   * @param {number} accountId
   * @param {number|null} profileId  null = new connection (no profile yet)
   */
  async initializeClient(accountId, profileId = null) {
    // If profileId given, check if already running
    if (profileId !== null) {
      const existing = this._getEntryByProfileId(profileId);
      if (existing) {
        const { entry } = existing;
        if (['initializing', 'connected', 'qr'].includes(entry.status)) {
          console.log(`[WA] Déjà en cours (${entry.status}) — profil ${profileId}`);
          if (entry.status === 'connected') {
            this.io?.to(`account_${accountId}`).emit('status', {
              isConnected: true, qrCode: null, status: 'connected',
              profileId: entry.profileId, phoneNumber: entry.phoneNumber
            });
          } else if (entry.qrCode) {
            this.io?.to(`account_${accountId}`).emit('status', {
              isConnected: false, qrCode: entry.qrCode, status: 'qr', profileId
            });
          }
          return;
        }
        if (entry.lastErrorAt && Date.now() - entry.lastErrorAt < REINIT_COOLDOWN_MS) {
          const remaining = Math.ceil((REINIT_COOLDOWN_MS - (Date.now() - entry.lastErrorAt)) / 1000);
          this.io?.to(`account_${accountId}`).emit('status', {
            isConnected: false, qrCode: null, status: 'cooldown', profileId,
            message: `Patientez ${remaining}s avant de réessayer`
          });
          return;
        }
        await this._destroyEntry(existing.key);
      }
    } else {
      // Dedup for new connections (profileId unknown) — prevent multiple simultaneous clients
      const existingEntries = this._getEntriesForAccount(accountId);
      const active = existingEntries.find(e =>
        ['initializing', 'connected', 'qr'].includes(e.entry.status)
      );
      if (active) {
        console.log(`[WA] Déjà actif (${active.entry.status}) — compte ${accountId}, ignoré`);
        if (active.entry.status === 'connected') {
          this.io?.to(`account_${accountId}`).emit('status', {
            isConnected: true, qrCode: null, status: 'connected',
            profileId: active.entry.profileId, phoneNumber: active.entry.phoneNumber
          });
        } else if (active.entry.qrCode) {
          this.io?.to(`account_${accountId}`).emit('status', {
            isConnected: false, qrCode: active.entry.qrCode, status: 'qr',
            profileId: active.entry.profileId
          });
        }
        return;
      }
    }

    // Choose the client map key
    const clientKey = profileId !== null ? profileId : this._tempKey(accountId);
    const sessionId = this._sessionId(clientKey);
    this._cleanChromeLocks(clientKey);

    const isWindows = process.platform === 'win32';
    const puppeteerArgs = [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=TranslateUI',
    ];
    if (!isWindows) puppeteerArgs.push('--no-zygote', '--single-process');

    console.log(`[WA] Initialisation — compte ${accountId}, clé ${clientKey} (${process.platform})`);

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `session-${sessionId}`, dataPath: SESSION_BASE }),
      puppeteer: { headless: true, args: puppeteerArgs }
    });

    this.clients.set(clientKey, {
      client,
      status: 'initializing',
      accountId,
      profileId: profileId,
      phoneNumber: null,
      qrCode: null,
      lastErrorAt: null
    });

    // ── QR ──
    client.on('qr', (qr) => {
      console.log(`[WA] QR Code — clé ${clientKey}`);
      const entry = this.clients.get(clientKey);
      if (entry) { entry.qrCode = qr; entry.status = 'qr'; }
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: qr, status: 'qr',
        profileId: profileId
      });
    });

    // ── Ready ──
    client.on('ready', async () => {
      const phoneNumber = '+' + client.info.wid.user;
      console.log(`[WA] Connecté — ${phoneNumber} (compte ${accountId})`);

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

      // Move from temp key to real profileId if needed
      if (clientKey !== profile.id) {
        const entry = this.clients.get(clientKey);
        if (entry) {
          this.clients.delete(clientKey);
          entry.profileId = profile.id;
          entry.phoneNumber = phoneNumber;
          entry.qrCode = null;
          entry.status = 'connected';
          entry.lastErrorAt = null;
          this.clients.set(profile.id, entry);
        }
        // Rename session folder from temp key to persistent profile key
        // so restoreExistingSessions can find it on next server restart
        const oldSessionDir = path.join(SESSION_BASE, `session-${clientKey}`);
        const newSessionDir = path.join(SESSION_BASE, `session-profile_${profile.id}`);
        if (fs.existsSync(oldSessionDir) && !fs.existsSync(newSessionDir)) {
          try {
            fs.renameSync(oldSessionDir, newSessionDir);
            console.log(`[WA] Session renommée: ${clientKey} → profile_${profile.id}`);
          } catch (renameErr) {
            // On Windows, Chrome may still have files locked — try again after a short delay
            setTimeout(() => {
              try {
                if (fs.existsSync(oldSessionDir) && !fs.existsSync(newSessionDir)) {
                  fs.renameSync(oldSessionDir, newSessionDir);
                  console.log(`[WA] Session renommée (delayed): ${clientKey} → profile_${profile.id}`);
                }
              } catch (_) {}
            }, 3000);
          }
        }
      } else {
        const entry = this.clients.get(clientKey);
        if (entry) {
          entry.profileId = profile.id;
          entry.phoneNumber = phoneNumber;
          entry.qrCode = null;
          entry.status = 'connected';
          entry.lastErrorAt = null;
        }
      }

      this.io?.to(`account_${accountId}`).emit('profile-ready', {
        id: profile.id,
        phone_number: profile.phone_number,
        display_name: profile.display_name,
        is_connected: true
      });

      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: true, qrCode: null, status: 'connected',
        profileId: profile.id, phoneNumber: profile.phone_number
      });
    });

    // ── Status view tracking (message_ack on status@broadcast) ──
    client.on('message_ack', async (msg, ack) => {
      try {
        if (msg.to !== 'status@broadcast' || ack < 3) return;
        const found = this._findEntryByClient(client);
        if (!found?.entry?.profileId) return;
        const updated = await this.prisma.status.updateMany({
          where: { wa_msg_id: msg.id._serialized, profile_id: found.entry.profileId },
          data: { view_count: { increment: 1 } }
        });
        if (updated.count > 0) {
          this.io?.to(`account_${accountId}`).emit('status-view-update', {
            waMsgId: msg.id._serialized, profileId: found.entry.profileId
          });
        }
      } catch (err) {
        console.error('[WA] Erreur ack statut:', err.message);
      }
    });

    // ── Incoming message ──
    client.on('message', async (message) => {
      try {
        if (message.fromMe) return;
        const entry = this._getEntryByProfileId(profileId !== null ? profileId : null)
          || this._findEntryByClient(client);
        if (!entry?.entry?.profileId) return;

        const currentProfileId = entry.entry.profileId;
        await messageHandler.handleIncomingMessage(message, client, this.prisma, currentProfileId, this);

        const contact = await message.getContact();
        const phone = '+' + (contact.number || contact.id.user);
        this.io?.to(`account_${accountId}`).emit('new-message', {
          from: phone, body: message.body, timestamp: message.timestamp,
          profileId: currentProfileId
        });
      } catch (err) {
        console.error('[WA] Erreur message:', err.message);
      }
    });

    // ── Disconnected ──
    client.on('disconnected', async (reason) => {
      console.log(`[WA] Déconnecté — clé ${clientKey}: ${reason}`);
      const found = this._findEntryByClient(client);
      const resolvedProfileId = found?.entry?.profileId;

      if (resolvedProfileId) {
        try {
          await this.prisma.whatsAppProfile.update({
            where: { id: resolvedProfileId }, data: { is_connected: false }
          });
        } catch (err) {
          console.error('[WA] Erreur DB disconnect:', err.message);
        }
        this.clearCache(resolvedProfileId);
      }

      if (found) {
        found.entry.status = 'disconnected';
        found.entry.qrCode = null;
        this.clients.delete(found.key);
      }

      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'disconnected',
        profileId: resolvedProfileId || null
      });
    });

    // ── Auth failure ──
    client.on('auth_failure', (msg) => {
      console.error(`[WA] Auth failure — clé ${clientKey}:`, msg);
      const found = this._findEntryByClient(client);
      if (found) { found.entry.status = 'auth_failure'; found.entry.lastErrorAt = Date.now(); }
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'auth_failure',
        profileId: profileId,
        message: 'Authentification refusée. Réessayez en scannant le QR code.'
      });
      client.destroy().catch(() => {});
      if (found) this.clients.delete(found.key);
    });

    // ── Init error ──
    client.initialize().catch(async (err) => {
      console.error(`[WA] Erreur initialisation clé ${clientKey}:`, err.message);
      try { await client.destroy(); } catch (_) {}
      this._cleanChromeLocks(clientKey);

      const found = this._findEntryByClient(client);
      if (found) { found.entry.status = 'error'; found.entry.lastErrorAt = Date.now(); }

      const isBrowserLocked = err.message?.includes('already running') || err.message?.includes('userDataDir');
      const isContextDestroyed = err.message?.includes('context was destroyed') || err.message?.includes('Navigating frame');
      let userMessage;
      if (isBrowserLocked) userMessage = 'Un Chrome précédent bloquait la session — il a été nettoyé. Réessayez.';
      else if (isContextDestroyed) userMessage = 'Chrome a démarré mais a planté. Vérifiez que Google Chrome est installé.';
      else userMessage = `Erreur WhatsApp: ${err.message}`;

      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'error', profileId, message: userMessage
      });

      setTimeout(() => {
        if (found) {
          const e = this.clients.get(found.key);
          if (e?.status === 'error') this.clients.delete(found.key);
        }
      }, REINIT_COOLDOWN_MS);
    });
  }

  _findEntryByClient(client) {
    for (const [key, entry] of this.clients) {
      if (entry.client === client) return { key, entry };
    }
    return null;
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  getStatus(accountId) {
    const entries = this._getEntriesForAccount(accountId);
    if (entries.length === 0) {
      return { isConnected: false, qrCode: null, status: 'not_initialized', profileId: null, phoneNumber: null };
    }
    // Prefer connected, then qr, then first
    const connected = entries.find(e => e.entry.status === 'connected');
    const qr = entries.find(e => e.entry.status === 'qr');
    const { entry } = connected || qr || entries[0];
    return {
      isConnected: entry.status === 'connected',
      qrCode: entry.qrCode,
      status: entry.status,
      profileId: entry.profileId || null,
      phoneNumber: entry.phoneNumber || null
    };
  }

  getProfileStatus(profileId) {
    const found = this._getEntryByProfileId(profileId);
    if (!found) return { isConnected: false, qrCode: null, status: 'not_initialized' };
    const { entry } = found;
    return { isConnected: entry.status === 'connected', qrCode: entry.qrCode, status: entry.status };
  }

  getAllStatuses(accountId) {
    return this._getEntriesForAccount(accountId).map(({ entry }) => ({
      profileId: entry.profileId,
      phoneNumber: entry.phoneNumber,
      status: entry.status,
      isConnected: entry.status === 'connected'
    }));
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  async sendMessage(profileId, to, content) {
    const found = this._getEntryByProfileId(profileId);
    if (!found || found.entry.status !== 'connected') throw new Error('WhatsApp non connecté pour ce profil');
    await found.entry.client.sendMessage(to, content);
  }

  // ─── Post WhatsApp Status (story) ────────────────────────────────────────

  async postStatus(profileId, content, type, mediaBase64) {
    const found = this._getEntryByProfileId(profileId);
    if (!found || found.entry.status !== 'connected') throw new Error('WhatsApp non connecté pour ce profil');
    const client = found.entry.client;

    let msg;
    if (type === 'image' && mediaBase64) {
      const media = new MessageMedia('image/jpeg', mediaBase64);
      msg = await client.sendMessage('status@broadcast', media, { caption: content || '' });
    } else {
      msg = await client.sendMessage('status@broadcast', content);
    }
    return msg?.id?._serialized || null;
  }

  // ─── Delete WhatsApp Status ───────────────────────────────────────────────

  async deleteStatus(profileId, waMsgId) {
    const found = this._getEntryByProfileId(profileId);
    if (!found || found.entry.status !== 'connected') return;
    try {
      const chat = await found.entry.client.getChatById('status@broadcast');
      const messages = await chat.fetchMessages({ limit: 50 });
      const msg = messages.find(m => m.id._serialized === waMsgId);
      if (msg) await msg.delete(true);
    } catch (err) {
      console.error('[WA] Erreur suppression statut WA:', err.message);
    }
  }

  // ─── Logout ──────────────────────────────────────────────────────────────

  async logout(profileId) {
    const found = this._getEntryByProfileId(profileId);
    if (found) {
      try { await found.entry.client.logout(); } catch (_) {}
      try { await found.entry.client.destroy(); } catch (_) {}
      this.clients.delete(found.key);
      this.clearCache(profileId);
    }
    try {
      await this.prisma.whatsAppProfile.update({
        where: { id: profileId }, data: { is_connected: false }
      });
    } catch (_) {}

    const sessionDir = path.join(SESSION_BASE, `session-profile_${profileId}`);
    if (fs.existsSync(sessionDir)) {
      const deleteWithRetry = (retries = 4, delay = 1500) => {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`[WA] Session supprimée — profil ${profileId}`);
        } catch (err) {
          if (retries > 0 && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOTEMPTY')) {
            console.warn(`[WA] Session verrouillée (${err.code}), nouvelle tentative dans ${delay}ms...`);
            setTimeout(() => deleteWithRetry(retries - 1, delay * 2), delay);
          } else {
            console.error(`[WA] Impossible de supprimer la session: ${err.message}`);
          }
        }
      };
      deleteWithRetry();
    }
  }

  // ─── Restore sessions on startup ─────────────────────────────────────────

  async restoreExistingSessions() {
    try {
      const profiles = await this.prisma.whatsAppProfile.findMany({
        where: { is_connected: true }
      });
      console.log(`Restauration de ${profiles.length} session(s) WhatsApp`);
      for (const profile of profiles) {
        this._cleanChromeLocks(profile.id);
        await this.initializeClient(profile.account_id, profile.id);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error('[WA] Erreur restauration sessions:', err.message);
    }
  }
}

module.exports = new WhatsAppManager();
