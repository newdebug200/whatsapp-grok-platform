const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const messageHandler = require('./messageHandler');

// ─── Lazy-load whatsapp-web.js ────────────────────────────────────────────────
let Client = null;
let LocalAuth = null;
let WWEB_AVAILABLE = false;

try {
  const wweb = require('whatsapp-web.js');
  Client = wweb.Client;
  LocalAuth = wweb.LocalAuth;
  WWEB_AVAILABLE = true;
} catch (err) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  ATTENTION : whatsapp-web.js introuvable dans node_modules  ║');
  console.error('║  Supprimez node_modules et relancez npm install              ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
}

const REINIT_COOLDOWN_MS = 10000;
const SESSION_BASE = path.join(__dirname, '../../.wwebjs_auth');
const CONTEXT_MAX = 20;

class WhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.contextCache = new Map();
    this.runningCampaigns = new Map(); // campaignId → { cancelled: boolean }
    this.io = null;
    this.prisma = null;
  }

  setIO(io) { this.io = io; }
  setPrisma(prisma) { this.prisma = prisma; }

  // ─── Context cache ────────────────────────────────────────────────────────

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

  // ─── Client lookup ────────────────────────────────────────────────────────

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

  _tempKey(accountId) { return `tmp_${accountId}_${Date.now()}`; }

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
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
      }
    }
  }

  async _destroyEntry(key) {
    const entry = this.clients.get(key);
    if (!entry) return;
    try { await entry.client.destroy(); } catch (_) {}
    this.clients.delete(key);
  }

  _findEntryByClient(client) {
    for (const [key, entry] of this.clients) {
      if (entry.client === client) return { key, entry };
    }
    return null;
  }

  // ─── Sleep helper (cancellable) ───────────────────────────────────────────

  _sleep(ms, handle) {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (handle?.cancelled) { clearInterval(interval); resolve(); }
      }, 500);
      setTimeout(() => { clearInterval(interval); resolve(); }, ms);
    });
  }

  // ─── Import WhatsApp contacts from phone book ─────────────────────────────

  async _importContacts(client, profileId) {
    if (!WWEB_AVAILABLE) return;
    try {
      const allContacts = await client.getContacts();
      const myContacts = allContacts.filter(c =>
        c.isMyContact && !c.isGroup && c.id?.server === 'c.us'
      );
      console.log(`[WA] Import de ${myContacts.length} contact(s) depuis le répertoire — profil ${profileId}`);
      let imported = 0;
      for (const wContact of myContacts) {
        try {
          const phoneNumber = '+' + wContact.id.user;
          const waId = wContact.id._serialized || (wContact.id.user + '@c.us');
          const name = wContact.name || wContact.pushname || null;
          await this.prisma.contact.upsert({
            where: { profile_id_phone_number: { profile_id: profileId, phone_number: phoneNumber } },
            create: { profile_id: profileId, phone_number: phoneNumber, wa_id: waId, name },
            update: { wa_id: waId, ...(name ? { name } : {}) }
          });
          imported++;
        } catch (_) {}
      }
      console.log(`[WA] ${imported} contact(s) importés — profil ${profileId}`);
    } catch (err) {
      console.warn('[WA] Import contacts impossible:', err.message);
    }
  }

  // ─── Initialize a WhatsApp client ─────────────────────────────────────────

  async initializeClient(accountId, profileId = null) {
    if (!WWEB_AVAILABLE) {
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'error', profileId,
        message: 'Module WhatsApp non installé. Supprimez node_modules et relancez npm install.'
      });
      return;
    }

    if (profileId !== null) {
      const existing = this._getEntryByProfileId(profileId);
      if (existing) {
        const { entry } = existing;
        if (['initializing', 'connected', 'qr'].includes(entry.status)) {
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
      const existingEntries = this._getEntriesForAccount(accountId);
      const active = existingEntries.find(e =>
        ['initializing', 'connected', 'qr'].includes(e.entry.status)
      );
      if (active) {
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

    console.log(`[WA] Initialisation — compte ${accountId}, clé ${clientKey}`);

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `session-${sessionId}`, dataPath: SESSION_BASE }),
      puppeteer: { headless: true, args: puppeteerArgs }
    });

    this.clients.set(clientKey, {
      client, status: 'initializing', accountId,
      profileId, phoneNumber: null, qrCode: null, lastErrorAt: null
    });

    // ── QR ──
    client.on('qr', (qr) => {
      const entry = this.clients.get(clientKey);
      if (entry) { entry.qrCode = qr; entry.status = 'qr'; }
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: qr, status: 'qr', profileId
      });
    });

    // ── Ready ──
    client.on('ready', async () => {
      const phoneNumber = '+' + client.info.wid.user;
      console.log(`[WA] Connecté — ${phoneNumber}`);

      let profile;
      try {
        profile = await this.prisma.whatsAppProfile.upsert({
          where: { account_id_phone_number: { account_id: accountId, phone_number: phoneNumber } },
          create: { account_id: accountId, phone_number: phoneNumber, is_connected: true },
          update: { is_connected: true }
        });
      } catch (err) {
        console.error('[WA] Erreur upsert profil:', err.message);
        return;
      }

      // Move from temp key to real profileId
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
        const oldDir = path.join(SESSION_BASE, `session-${clientKey}`);
        const newDir = path.join(SESSION_BASE, `session-profile_${profile.id}`);
        if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
          try { fs.renameSync(oldDir, newDir); } catch (_) {
            setTimeout(() => {
              try { if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.renameSync(oldDir, newDir); } catch (_) {}
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
        id: profile.id, phone_number: profile.phone_number,
        display_name: profile.display_name, is_connected: true
      });
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: true, qrCode: null, status: 'connected',
        profileId: profile.id, phoneNumber: profile.phone_number
      });

      // Import phone book contacts in background
      this._importContacts(client, profile.id).catch(() => {});
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
      console.log(`[WA] Déconnecté — ${reason}`);
      const found = this._findEntryByClient(client);
      const resolvedProfileId = found?.entry?.profileId;
      if (resolvedProfileId) {
        try {
          await this.prisma.whatsAppProfile.update({
            where: { id: resolvedProfileId }, data: { is_connected: false }
          });
        } catch (_) {}
        this.clearCache(resolvedProfileId);
      }
      if (found) { found.entry.status = 'disconnected'; found.entry.qrCode = null; this.clients.delete(found.key); }
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'disconnected',
        profileId: resolvedProfileId || null
      });
    });

    // ── Auth failure ──
    client.on('auth_failure', (msg) => {
      console.error(`[WA] Auth failure:`, msg);
      const found = this._findEntryByClient(client);
      if (found) { found.entry.status = 'auth_failure'; found.entry.lastErrorAt = Date.now(); }
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'auth_failure', profileId,
        message: 'Authentification refusée. Scannez de nouveau le QR code.'
      });
      client.destroy().catch(() => {});
      if (found) this.clients.delete(found.key);
    });

    // ── Init error ──
    client.initialize().catch(async (err) => {
      console.error(`[WA] Erreur init:`, err.message);
      try { await client.destroy(); } catch (_) {}
      this._cleanChromeLocks(clientKey);
      const found = this._findEntryByClient(client);
      if (found) { found.entry.status = 'error'; found.entry.lastErrorAt = Date.now(); }
      const isBrowserLocked = err.message?.includes('already running') || err.message?.includes('userDataDir');
      const isContextDestroyed = err.message?.includes('context was destroyed') || err.message?.includes('Navigating frame');
      let userMessage;
      if (isBrowserLocked) userMessage = 'Un Chrome précédent bloquait — nettoyé. Réessayez.';
      else if (isContextDestroyed) userMessage = 'Chrome a planté. Vérifiez que Google Chrome est installé.';
      else userMessage = `Erreur WhatsApp: ${err.message}`;
      this.io?.to(`account_${accountId}`).emit('status', {
        isConnected: false, qrCode: null, status: 'error', profileId, message: userMessage
      });
      setTimeout(() => {
        if (found) { const e = this.clients.get(found.key); if (e?.status === 'error') this.clients.delete(found.key); }
      }, REINIT_COOLDOWN_MS);
    });
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  getStatus(accountId) {
    const entries = this._getEntriesForAccount(accountId);
    if (entries.length === 0) {
      return { isConnected: false, qrCode: null, status: 'not_initialized', profileId: null, phoneNumber: null };
    }
    const connected = entries.find(e => e.entry.status === 'connected');
    const qr = entries.find(e => e.entry.status === 'qr');
    const { entry } = connected || qr || entries[0];
    return {
      isConnected: entry.status === 'connected', qrCode: entry.qrCode, status: entry.status,
      profileId: entry.profileId || null, phoneNumber: entry.phoneNumber || null
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
      profileId: entry.profileId, phoneNumber: entry.phoneNumber,
      status: entry.status, isConnected: entry.status === 'connected'
    }));
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  async sendMessage(profileId, to, content) {
    if (!WWEB_AVAILABLE) throw new Error('Module WhatsApp non installé');
    const found = this._getEntryByProfileId(profileId);
    if (!found || found.entry.status !== 'connected') throw new Error('WhatsApp non connecté');
    await found.entry.client.sendMessage(to, content);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(profileId) {
    const found = this._getEntryByProfileId(profileId);
    if (found) {
      try { await found.entry.client.logout(); } catch (_) {}
      try { await found.entry.client.destroy(); } catch (_) {}
      this.clients.delete(found.key);
      this.clearCache(profileId);
    }
    try { await this.prisma.whatsAppProfile.update({ where: { id: profileId }, data: { is_connected: false } }); } catch (_) {}
    const sessionDir = path.join(SESSION_BASE, `session-profile_${profileId}`);
    if (fs.existsSync(sessionDir)) {
      const deleteWithRetry = (retries = 4, delay = 1500) => {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (err) {
          if (retries > 0 && ['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(err.code)) {
            setTimeout(() => deleteWithRetry(retries - 1, delay * 2), delay);
          }
        }
      };
      deleteWithRetry();
    }
  }

  // ─── Restore sessions ─────────────────────────────────────────────────────

  async restoreExistingSessions() {
    if (!WWEB_AVAILABLE) {
      console.log('[WA] Restauration ignorée : whatsapp-web.js non installé');
      return;
    }
    try {
      const profiles = await this.prisma.whatsAppProfile.findMany({ where: { is_connected: true } });
      console.log(`Restauration de ${profiles.length} session(s) WhatsApp`);
      for (const profile of profiles) {
        this._cleanChromeLocks(profile.id);
        await this.initializeClient(profile.account_id, profile.id);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error('[WA] Erreur restauration:', err.message);
    }
  }

  // ─── Campaign runner ──────────────────────────────────────────────────────

  async startCampaign(campaignId, profileId) {
    if (this.runningCampaigns.has(campaignId)) return;

    const found = this._getEntryByProfileId(profileId);
    if (!found || found.entry.status !== 'connected') {
      const accountId = found?.entry?.accountId;
      try {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'draft' }
        });
      } catch (_) {}
      if (accountId) {
        this.io?.to(`account_${accountId}`).emit('campaign-error', {
          campaignId, error: 'WhatsApp non connecté pour ce profil. Reconnectez WhatsApp avant de lancer la campagne.'
        });
      }
      return;
    }

    const waClient = found.entry.client;
    const accountId = found.entry.accountId;
    const handle = { cancelled: false };
    this.runningCampaigns.set(campaignId, handle);

    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          messages: { orderBy: { order_index: 'asc' } },
          targets: {
            where: { status: 'pending' },
            include: { contact: true },
            orderBy: { id: 'asc' }
          }
        }
      });

      if (!campaign || campaign.targets.length === 0) {
        this.runningCampaigns.delete(campaignId);
        await this.prisma.campaign.update({
          where: { id: campaignId }, data: { status: 'completed', completed_at: new Date() }
        });
        return;
      }

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'running', started_at: new Date() }
      });

      const targets = campaign.targets;
      const totalTargets = await this.prisma.campaignTarget.count({ where: { campaign_id: campaignId } });

      // Async runner — fire and forget
      (async () => {
        for (let i = 0; i < targets.length; i++) {
          if (handle.cancelled) break;

          // Human-like delay between contacts: 30–90 seconds (skip before first)
          if (i > 0) {
            const delayMs = (30 + Math.random() * 60) * 1000;
            console.log(`[Campaign ${campaignId}] Pause ${Math.round(delayMs / 1000)}s avant prochain contact…`);
            await this._sleep(delayMs, handle);
            if (handle.cancelled) break;
          }

          const target = targets[i];
          const contact = target.contact;
          const waId = contact.wa_id || (contact.phone_number.replace('+', '') + '@c.us');

          try {
            for (let j = 0; j < campaign.messages.length; j++) {
              if (handle.cancelled) break;

              // Delay between messages within same contact: 3–10 seconds
              if (j > 0) {
                await this._sleep((3 + Math.random() * 7) * 1000, handle);
                if (handle.cancelled) break;
              }

              const msg = campaign.messages[j];
              const content = msg.content.replace(/\{\{name\}\}/gi, contact.name || 'cher(e) client(e)');
              await waClient.sendMessage(waId, content);

              this.prisma.message.create({
                data: { contact_id: contact.id, content, direction: 'sent', type: 'text', created_at: new Date() }
              }).catch(() => {});
            }

            if (!handle.cancelled) {
              await this.prisma.campaignTarget.update({
                where: { id: target.id },
                data: { status: 'sent', sent_at: new Date() }
              });
            }
          } catch (err) {
            console.error(`[Campaign ${campaignId}] Erreur envoi à ${contact.phone_number}:`, err.message);
            await this.prisma.campaignTarget.update({
              where: { id: target.id },
              data: { status: 'failed', error: err.message.slice(0, 200) }
            }).catch(() => {});
          }

          // Emit real-time progress
          const done = await this.prisma.campaignTarget.count({
            where: { campaign_id: campaignId, status: { not: 'pending' } }
          });
          this.io?.to(`account_${accountId}`).emit('campaign-progress', {
            campaignId, done, total: totalTargets
          });
        }

        if (!handle.cancelled) {
          await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'completed', completed_at: new Date() }
          });
          const finalDone = await this.prisma.campaignTarget.count({
            where: { campaign_id: campaignId, status: { not: 'pending' } }
          });
          this.io?.to(`account_${accountId}`).emit('campaign-progress', {
            campaignId, done: finalDone, total: totalTargets, completed: true
          });
          console.log(`[Campaign ${campaignId}] Terminée — ${finalDone}/${totalTargets} envoyés`);
        }

        this.runningCampaigns.delete(campaignId);
      })().catch(err => {
        console.error(`[Campaign ${campaignId}] Erreur runner:`, err.message);
        this.runningCampaigns.delete(campaignId);
        this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } }).catch(() => {});
      });

    } catch (err) {
      console.error(`[Campaign ${campaignId}] Erreur démarrage:`, err.message);
      this.runningCampaigns.delete(campaignId);
    }
  }

  async stopCampaign(campaignId) {
    const handle = this.runningCampaigns.get(campaignId);
    if (handle) {
      handle.cancelled = true;
      this.runningCampaigns.delete(campaignId);
    }
    try {
      await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
    } catch (_) {}
    console.log(`[Campaign ${campaignId}] Mis en pause`);
  }
}

module.exports = new WhatsAppManager();
