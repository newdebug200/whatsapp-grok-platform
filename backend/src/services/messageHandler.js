const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PERSONALITY_PROMPTS = {
  professional: "Tu communiques de manière professionnelle, formelle et courtoise. Tu utilises un langage soutenu.",
  friendly: "Tu communiques de manière amicale, chaleureuse et décontractée. Tu tutois le client et utilises des emojis avec modération.",
  commercial: "Tu es orienté vente et conversion. Tu mets en avant les bénéfices, crées de l'urgence et incites à l'action. Tu es enthousiaste et persuasif.",
  support: "Tu es un expert technique patient et méthodique. Tu poses des questions précises pour diagnostiquer les problèmes et fournis des solutions claires étape par étape."
};

class MessageHandler {
  constructor() {
    this.pendingMessages = new Map();
    this.awaySentMap = new Map();
  }

  _isWithinBusinessHours(botConfig) {
    if (!botConfig.business_hours_enabled) return true;
    const tz = botConfig.timezone || 'UTC';
    let tzDate;
    try {
      tzDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    } catch (_) {
      tzDate = new Date();
    }
    const dayOfWeek = tzDate.getDay();
    const openDays = (botConfig.open_days || '1,2,3,4,5').split(',').map(Number);
    if (!openDays.includes(dayOfWeek)) return false;
    const currentMinutes = tzDate.getHours() * 60 + tzDate.getMinutes();
    const [openH, openM] = (botConfig.open_time || '09:00').split(':').map(Number);
    const [closeH, closeM] = (botConfig.close_time || '18:00').split(':').map(Number);
    return currentMinutes >= openH * 60 + openM && currentMinutes < closeH * 60 + closeM;
  }

  async _analyzeSentiment(text, apiKey) {
    if (!text || !apiKey) return null;
    try {
      const resp = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'Tu es un analyseur de sentiment client. Réponds UNIQUEMENT par un seul mot parmi: positif, neutre, negatif, colere, satisfait, frustre, inquiet, confus, reconnaissant, urgent. Utilise urgent uniquement si une action rapide est nécessaire. Pas d\'explication.'
            },
            { role: 'user', content: `Quel est le sentiment de ce message WhatsApp ? "${text.slice(0, 300)}"` }
          ],
          temperature: 0,
          max_tokens: 10
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      const raw = resp.data.choices[0].message.content.trim().toLowerCase();
      const allowed = ['positif', 'neutre', 'negatif', 'colere', 'satisfait', 'frustre', 'inquiet', 'confus', 'reconnaissant', 'urgent'];
      if (allowed.includes(raw)) return raw;
      if (raw.includes('col')) return 'colere';
      if (raw.includes('neg')) return 'negatif';
      if (raw.includes('satisf') || raw.includes('content')) return 'satisfait';
      if (raw.includes('frustr')) return 'frustre';
      if (raw.includes('inqui') || raw.includes('préoccup')) return 'inquiet';
      if (raw.includes('confus') || raw.includes('incompr')) return 'confus';
      if (raw.includes('remerci') || raw.includes('reconna')) return 'reconnaissant';
      if (raw.includes('urgent')) return 'urgent';
      if (raw.includes('pos')) return 'positif';
      return 'neutre';
    } catch (_) {
      return null;
    }
  }

  async _updateMemory(contact, prisma, apiKey, newMessageText) {
    if (!apiKey) return;
    try {
      const existing = await prisma.contactMemory.findUnique({ where: { contact_id: contact.id } });
      const oldSummary = existing?.summary || '';
      const prompt = oldSummary
        ? `Résumé existant: "${oldSummary}"\nNouveau message du client: "${newMessageText.slice(0, 400)}"\nMets à jour le résumé en 2-3 phrases maximum. Inclus: intérêts, problèmes, demandes, ton général.`
        : `Premier message du client: "${newMessageText.slice(0, 400)}"\nFais un résumé en 1-2 phrases de ce qu'on sait sur ce client.`;

      const resp = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'Tu es un assistant qui résume les interactions client de manière concise.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 150
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      const summary = resp.data.choices[0].message.content.trim();
      await prisma.contactMemory.upsert({
        where: { contact_id: contact.id },
        create: { contact_id: contact.id, summary },
        update: { summary }
      });
    } catch (_) {}
  }

  async handleIncomingMessage(message, client, prisma, profileId, waManager, options = {}) {
    const { skipAI = false } = options;
    try {
      if (message.fromMe) return;
      if (message.from === 'status@broadcast' || message.from.includes('@broadcast')) return;

      const messageAgeMs = Date.now() - message.timestamp * 1000;
      if (messageAgeMs > 60000) return;

      const isGroup = message.from.includes('@g.us');
      const waId = message.from;

      let phoneNumber, contactName;
      if (isGroup) {
        const chat = await message.getChat();
        phoneNumber = `group_${message.from.split('@')[0]}`;
        contactName = chat.name || `Groupe ${message.from.split('@')[0]}`;
      } else {
        const contact = await message.getContact();
        phoneNumber = '+' + (contact.number || contact.id.user);
        contactName = contact.name || contact.pushname || null;
      }

      let dbContact = await prisma.contact.findUnique({
        where: { profile_id_phone_number: { profile_id: profileId, phone_number: phoneNumber } }
      });

      if (!dbContact) {
        dbContact = await prisma.contact.create({
          data: { profile_id: profileId, phone_number: phoneNumber, wa_id: waId, name: contactName }
        });
      } else {
        const updates = {};
        if (contactName && dbContact.name !== contactName) updates.name = contactName;
        if (!dbContact.wa_id && waId) updates.wa_id = waId;
        if (Object.keys(updates).length > 0) {
          dbContact = await prisma.contact.update({ where: { id: dbContact.id }, data: updates });
        }
      }

      const mediaTypeLabel = message.hasMedia
        ? (message.type === 'image' ? 'Image' : message.type === 'video' ? 'Vidéo'
          : message.type === 'audio' || message.type === 'ptt' ? 'Audio'
          : message.type === 'document' ? 'Document' : message.type === 'sticker' ? 'Sticker' : 'Fichier')
        : null;

      const messageContent = mediaTypeLabel ? `[${mediaTypeLabel}]` : (message.body || '');

      // ── Download media if present ──
      let mediaPath = null;
      if (message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          if (media?.data) {
            const mimeType = media.mimetype || 'application/octet-stream';
            const extRaw = mimeType.split('/')[1]?.split(';')[0] || 'bin';
            const safeExt = extRaw.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'bin';
            const filename = `${profileId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${safeExt}`;
            const uploadsDir = path.join(__dirname, '../../uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(media.data, 'base64'));
            mediaPath = filename;
          }
        } catch (_) {}
      }

      // ── Save message with unread=true (sentiment is filled in later, only if the bot actually responds) ──
      await prisma.message.create({
        data: {
          contact_id: dbContact.id,
          content: messageContent,
          direction: 'received',
          type: message.type || 'text',
          created_at: new Date(),
          unread: true,
          media_path: mediaPath
        }
      }).catch((err) => console.error('[WA] Enregistrement message entrant:', err.message));

      // ── Increment unread count before notifying the UI ──
      await prisma.contact.update({
        where: { id: dbContact.id },
        data: { unread_count: { increment: 1 } }
      }).catch((err) => console.error('[WA] Mise à jour compteur non-lu:', err.message));

      waManager.addToCache(profileId, dbContact.id, 'received', messageContent);

      // ── Groups: save message but skip AI and triggers ──
      if (isGroup) return;

      // ── Fetch account role + blocked status ──
      const profile = await prisma.whatsAppProfile.findUnique({
        where: { id: profileId },
        select: { account_id: true }
      });
      let isAdminAccount = false;
      if (profile) {
        const account = await prisma.account.findUnique({
          where: { id: profile.account_id },
          select: { is_blocked: true, role: true }
        });
        isAdminAccount = account?.role === 'admin';
        if (!isAdminAccount && account?.is_blocked) return;
      }

      if (!isAdminAccount) {
        const iaGlobalCfg = await prisma.platformConfig.findUnique({ where: { key: 'ia_enabled_global' } });
        if (iaGlobalCfg && iaGlobalCfg.value === 'false') return;
      }

      // ── Verification trigger check ──
      const verificationTriggerEnabledCfg = await prisma.platformConfig.findUnique({ where: { key: 'verification_triggers_enabled' } });
      if (!verificationTriggerEnabledCfg || verificationTriggerEnabledCfg.value !== 'false') {
        if (!message.hasMedia && message.body) {
          const triggers = await prisma.verificationTrigger.findMany({ where: { profile_id: profileId, is_active: true } });
          const bodyTrimmed = message.body.trim().toLowerCase();
          const matchedTrigger = triggers.find(t => t.text.trim().toLowerCase() === bodyTrimmed);
          if (matchedTrigger) {
            await this._handleVerificationTrigger(message, client, prisma, profileId, phoneNumber, waId, dbContact, waManager);
            return;
          }
        }
      }

      // ── Sensitive keyword detection ──
      const sensitiveEnabledCfg = await prisma.platformConfig.findUnique({ where: { key: 'sensitive_keywords_enabled' } });
      if (!sensitiveEnabledCfg || sensitiveEnabledCfg.value !== 'false') {
        if (!message.hasMedia && message.body) {
          const keywords = await prisma.sensitiveKeyword.findMany({ where: { profile_id: profileId, is_active: true } });
          const bodyLower = message.body.toLowerCase();
          const matched = keywords.find(k => bodyLower.includes(k.keyword.toLowerCase()));
          if (matched) {
            await prisma.contact.update({ where: { id: dbContact.id }, data: { ia_paused: true, sensitive_flagged: true } });
            prisma.sensitiveFlag.create({
              data: { profile_id: profileId, contact_id: dbContact.id, keyword_matched: matched.keyword, message_content: message.body.slice(0, 500) }
            }).catch(() => {});
            console.log(`[Keyword] Contact ${phoneNumber} flaggé — mot-clé: "${matched.keyword}"`);
            return;
          }
        }
      }

      if (skipAI) return;
      if (!isAdminAccount) {
        const autoRepliesCfg = await prisma.platformConfig.findUnique({ where: { key: 'auto_replies_enabled' } });
        if (autoRepliesCfg && autoRepliesCfg.value === 'false') return;
      }

      const botConfig = await prisma.botConfig.findUnique({ where: { profile_id: profileId } });

      if (message.hasMedia) {
        if (botConfig?.media_auto_reply !== false) {
          const label = mediaTypeLabel?.toLowerCase() || 'fichier';
          const response = `Nous recevons votre ${label} mais nous ne traitons que les messages texte. Merci de reformuler votre demande par écrit.`;
          const sentMediaReply = await client.sendMessage(waId, response);
          waManager.trackBotSentId(sentMediaReply?.id?._serialized);
          waManager.addToCache(profileId, dbContact.id, 'sent', response);
          prisma.message.create({
            data: { contact_id: dbContact.id, content: response, direction: 'sent', type: 'text', created_at: new Date(), unread: false }
          }).catch(() => {});
        }
        return;
      }

      // Sentiment analysis and memory update are no longer triggered here.
      // They now happen inside _processTextMessage, once we've confirmed the
      // bot is actually going to generate and send a reply (see below).
      const delayMs = (botConfig?.response_delay_seconds ?? 5) * 1000;
      this._queueMessage(message.body || '', waId, dbContact, client, prisma, profileId, waManager, delayMs, botConfig);
    } catch (error) {
      console.error('Erreur traitement message:', error);
    }
  }

  async _handleVerificationTrigger(message, client, prisma, profileId, phoneNumber, waId, dbContact, waManager) {
    try {
      // 1. Resolve sender's LID (the historical Dressur.site contract).
      let senderLid;
      if (waId.endsWith('@lid')) {
        senderLid = waId.split('@')[0];
      } else {
        try {
          const numId = await client.getNumberId(waId.split('@')[0]);
          senderLid = numId ? numId.user : waId.split('@')[0];
        } catch (_) {
          senderLid = waId.split('@')[0];
        }
      }

      // 2. Sync LIDs for numbers that don't have one yet in dressur.site
      try {
        const listRes = await axios.get(
          'https://dressur.site/crud/user/find_number_not_have_lid',
          { timeout: 8000 }
        );
        const numbersWithoutLid = Array.isArray(listRes.data)
          ? listRes.data.slice(0, 50)
          : [];

        if (numbersWithoutLid.length > 0) {
          console.log(`[Verification] Sync LID pour ${numbersWithoutLid.length} numéro(s)`);
          const lidEntries = await Promise.all(
            numbersWithoutLid.map(async (num) => {
              try {
                const numId = await client.getNumberId(String(num));
                return numId ? { phone: String(num), lid: numId.user } : null;
              } catch (_) { return null; }
            })
          );
          const number_and_lid = {};
          for (const entry of lidEntries) {
            if (entry) number_and_lid[entry.phone] = entry.lid;
          }
          if (Object.keys(number_and_lid).length > 0) {
            await axios.post(
              'https://dressur.site/crud/user/number_and_lid',
              { number_and_lid },
              { timeout: 15000, responseType: 'text' }
            );
            console.log(`[Verification] Sync LID OK — ${Object.keys(number_and_lid).length} entrée(s) envoyée(s)`);
          }
        }
      } catch (syncErr) {
        console.warn('[Verification] Sync LID ignoré:', syncErr.message);
      }

      // 3. Check if sender's number is activatable and reply with exact API response.
      const apiRes = await axios.get(
        `https://dressur.site/crud/user/find_whatsapp_is_activatable/${senderLid}`,
        { timeout: 10000, responseType: 'text' }
      );
      const replyText = (typeof apiRes.data === 'string' ? apiRes.data : JSON.stringify(apiRes.data)).trim();
      const sentVerif = await client.sendMessage(waId, replyText);
      waManager.trackBotSentId(sentVerif?.id?._serialized);
      waManager.addToCache(profileId, dbContact.id, 'sent', replyText);
      prisma.message.create({
        data: { contact_id: dbContact.id, content: replyText, direction: 'sent', type: 'text', created_at: new Date(), unread: false }
      }).catch(() => {});
    } catch (err) {
      console.error('[Verification] Erreur:', err.message);
    }
  }

  _queueMessage(body, from, contact, client, prisma, profileId, waManager, delayMs, botConfig) {
    const key = `${profileId}_${contact.id}`;
    if (this.pendingMessages.has(key)) {
      const pending = this.pendingMessages.get(key);
      clearTimeout(pending.timer);
      pending.messages.push(body);
    } else {
      this.pendingMessages.set(key, { messages: [body], timer: null, contact, client, prisma, profileId, from, waManager, delayMs, botConfig });
    }
    const pending = this.pendingMessages.get(key);
    pending.timer = setTimeout(async () => {
      this.pendingMessages.delete(key);
      const concatenated = pending.messages.join('\n');
      await this._processTextMessage(concatenated, pending.contact, pending.client, pending.prisma, pending.profileId, pending.from, pending.waManager, pending.botConfig);
    }, delayMs);
  }

  async _processTextMessage(messageText, contact, client, prisma, profileId, from, waManager, cachedBotConfig) {
    try {
      const freshContact = await prisma.contact.findUnique({ where: { id: contact.id } });
      if (freshContact?.ia_paused) return;

      const botConfig = cachedBotConfig || await prisma.botConfig.findUnique({ where: { profile_id: profileId } });
      if (!botConfig || !botConfig.ia_enabled) return;

      if (botConfig.business_hours_enabled && !this._isWithinBusinessHours(botConfig)) {
        const awayMsg = botConfig.away_message?.trim();
        if (awayMsg) {
          const awayKey = `${profileId}_${contact.id}`;
          const lastSent = this.awaySentMap.get(awayKey);
          const cooldownMs = 8 * 60 * 60 * 1000;
          const shouldSend = !botConfig.away_once_per_session || !lastSent || (Date.now() - lastSent > cooldownMs);
          if (shouldSend) {
            this.awaySentMap.set(awayKey, Date.now());
            try {
              const sentAway = await client.sendMessage(from, awayMsg);
              waManager.trackBotSentId(sentAway?.id?._serialized);
              waManager.addToCache(profileId, contact.id, 'sent', awayMsg);
              prisma.message.create({
                data: { contact_id: contact.id, content: awayMsg, direction: 'sent', type: 'text', created_at: new Date(), unread: false }
              }).catch(() => {});
            } catch (err) { console.error('[Heures bureau] Erreur:', err.message); }
          }
        }
        return;
      }

      const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
      if (!apiKey) {
        waManager.emitToProfileAccount(profileId, 'bot-error', {
          profileId, contactPhone: contact.phone_number || from,
          error: "Clé API Groq manquante. Ajoutez GROQ_API_KEY dans votre fichier .env et redémarrez le serveur."
        });
        return;
      }

      // ── Credits check happens BEFORE any Groq call. Sentiment analysis and
      //    memory update are only worth paying for once we know a reply can
      //    actually be generated and sent — otherwise they'd be silent API
      //    calls for a response nobody will see. ──
      let accountId = null;
      let creditsEnabled = false;
      let isAdminAccount = false;

      try {
        const creditsEnabledCfg = await prisma.platformConfig.findUnique({ where: { key: 'credits_enabled' } });
        creditsEnabled = creditsEnabledCfg?.value === 'true';

        const profileRow = await prisma.whatsAppProfile.findUnique({ where: { id: profileId }, select: { account_id: true } });
        accountId = profileRow?.account_id;

        if (accountId) {
          const accountRow = await prisma.account.findUnique({ where: { id: accountId }, select: { credit_balance: true, role: true } });
          isAdminAccount = accountRow?.role === 'admin';
          if (creditsEnabled && !isAdminAccount) {
            const currentBalance = accountRow?.credit_balance ?? 0;
            if (currentBalance <= 0) {
              waManager.emitToProfileAccount(profileId, 'bot-error', {
                profileId, contactPhone: contact.phone_number || from,
                error: "⚠️ Votre solde de crédits est épuisé. Contactez l'administrateur pour recharger."
              });
              return;
            }
          }
        }
      } catch (creditCheckErr) {
        console.error('[Credits] Erreur vérification solde:', creditCheckErr.message);
      }

      // ── From here on we're committed to generating and sending a reply,
      //    so sentiment analysis and memory update are now safe to run. ──
      const sentimentResult = await this._analyzeSentiment(messageText, apiKey).catch(() => null);
      if (sentimentResult) {
        prisma.message.findFirst({
          where: { contact_id: freshContact.id, direction: 'received' },
          orderBy: { created_at: 'desc' }
        }).then(lastMsg => {
          if (lastMsg) {
            prisma.message.update({ where: { id: lastMsg.id }, data: { sentiment: sentimentResult } }).catch(() => {});
          }
        }).catch(() => {});

        if ((sentimentResult === 'colere' || sentimentResult === 'negatif') && botConfig?.sentiment_alert !== false) {
          waManager.emitToProfileAccount(profileId, 'sentiment-alert', {
            profileId,
            contactId: freshContact.id,
            contactPhone: freshContact.phone_number || from,
            contactName: freshContact.name || freshContact.phone_number || from,
            sentiment: sentimentResult,
            message: messageText.slice(0, 200)
          });
          console.log(`[Sentiment] Alerte ${sentimentResult} pour ${freshContact.phone_number || from}`);
        }
      }

      this._updateMemory(freshContact, prisma, apiKey, messageText).catch(() => {});

      const faqs = await prisma.fAQ.findMany({ where: { profile_id: profileId } });

      // ── Load AI memory for this contact (fetched before the update above resolves,
      //    so this reply still uses the pre-update summary; the refreshed summary
      //    is used starting with the next message) ──
      const memory = await prisma.contactMemory.findUnique({ where: { contact_id: contact.id } }).catch(() => null);

      let recentMessages = waManager.getFromCache(profileId, contact.id);
      if (recentMessages.length === 0) {
        const dbMessages = await prisma.message.findMany({
          where: { contact_id: contact.id },
          orderBy: { created_at: 'asc' }
        });
        recentMessages = dbMessages.map(m => ({ direction: m.direction, content: m.content }));
        for (const m of recentMessages) waManager.addToCache(profileId, contact.id, m.direction, m.content);
      }

      await this._callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs, recentMessages, waManager, memory?.summary || null, { accountId, creditsEnabled });
    } catch (error) {
      console.error('Erreur processTextMessage:', error);
    }
  }

  async _callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs, recentMessages, waManager, memorySummary, creditInfo = {}) {
    const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) {
      waManager.emitToProfileAccount(profileId, 'bot-error', {
        profileId, contactPhone: contact.phone_number || from,
        error: "Clé API Groq manquante. Ajoutez GROQ_API_KEY dans votre fichier .env et redémarrez le serveur."
      });
      return;
    }

    const { accountId = null, creditsEnabled = false } = creditInfo;

    try {
      const systemPrompt = this._buildSystemPrompt(botConfig, faqs, memorySummary);

      const historyMessages = recentMessages
        .filter(m => m.content && !/^\[(Image|Vidéo|Audio|Document|Sticker|Fichier)\]$/.test(m.content))
        .slice(-20)
        .map(m => ({ role: m.direction === 'received' ? 'user' : 'assistant', content: m.content }));

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: systemPrompt }, ...historyMessages, { role: 'user', content: messageText }],
          temperature: 0.2,
          max_tokens: 400
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      const aiResponse = response.data.choices[0].message.content;
      const totalTokens = response.data.usage?.total_tokens || 0;

      const sentAI = await client.sendMessage(from, aiResponse);
      waManager.trackBotSentId(sentAI?.id?._serialized);
      waManager.addToCache(profileId, contact.id, 'sent', aiResponse);
      prisma.message.create({
        data: { contact_id: contact.id, content: aiResponse, direction: 'sent', type: 'text', created_at: new Date(), unread: false }
      }).catch(() => {});

      if (creditsEnabled && accountId && totalTokens > 0) {
        try {
          const creditRateCfg = await prisma.platformConfig.findUnique({ where: { key: 'credit_per_1000_tokens' } });
          const creditRate = parseFloat(creditRateCfg?.value || '0.01');
          const creditsToDeduct = parseFloat(((totalTokens / 1000) * creditRate).toFixed(4));
          await prisma.$transaction([
            prisma.account.update({ where: { id: accountId }, data: { credit_balance: { decrement: creditsToDeduct } } }),
            prisma.creditTransaction.create({
              data: { account_id: accountId, amount: -creditsToDeduct, type: 'debit', description: `Réponse IA — ${totalTokens} tokens`, tokens_used: totalTokens }
            })
          ]);
        } catch (deductErr) {
          console.error('[Credits] Erreur déduction:', deductErr.message);
        }
      }
    } catch (error) {
      const status = error.response?.status;
      let errorMsg = "Le bot IA n'a pas pu répondre.";
      if (status === 401) errorMsg = "Clé API Groq invalide ou expirée. Vérifiez GROQ_API_KEY dans votre .env.";
      else if (status === 429) errorMsg = "Limite de quota Groq atteinte. Réessayez dans quelques instants.";
      else if (status === 503 || status === 502) errorMsg = "API Groq temporairement indisponible. Réessayez dans un moment.";
      else console.error('Erreur API Groq:', error.message);
      waManager.emitToProfileAccount(profileId, 'bot-error', { profileId, contactPhone: contact.phone_number || from, error: errorMsg });
    }
  }

  _buildSystemPrompt(botConfig, faqs = [], memorySummary = null) {
    const botName = botConfig.bot_name || 'Botora';
    const personality = botConfig.personality || 'professional';
    const personalityInstruction = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.professional;

    // If admin has set a full system prompt override, use it directly
    if (botConfig.system_prompt_override?.trim()) {
      let prompt = botConfig.system_prompt_override;
      if (memorySummary) prompt += `\n\n🧠 MÉMOIRE CLIENT : ${memorySummary}`;
      return prompt;
    }

    let prompt = `Tu es ${botName}, un assistant intelligent sur WhatsApp.\n\n`;
    prompt += `🎭 PERSONNALITÉ : ${personalityInstruction}\n\n`;

    if (memorySummary) {
      prompt += `🧠 MÉMOIRE CLIENT (résumé des échanges passés) :\n${memorySummary}\n\n`;
    }

    if (botConfig.bot_info?.trim()) prompt += `📋 INFORMATIONS SUR TON DOMAINE :\n${botConfig.bot_info}\n\n`;
    if (faqs.length > 0) {
      prompt += `📚 FAQ :\n`;
      faqs.forEach(faq => { prompt += `Q: ${faq.question}\nR: ${faq.answer}\n`; });
      prompt += '\n';
    }
    if (botConfig.bot_behavior?.trim()) prompt += `🎯 RÈGLES DE COMPORTEMENT :\n${botConfig.bot_behavior}\n\n`;
    prompt += `⚙️ RÈGLES STRICTES :
1. Tu réponds UNIQUEMENT selon les informations fournies ci-dessus.
2. Si une question dépasse tes informations, réponds : "Je n'ai pas l'information pour répondre à cela, mais je peux vous orienter vers un conseiller."
3. Tu n'inventes JAMAIS d'informations.
4. Réponses en texte brut uniquement (pas de HTML, pas de markdown complexe).
5. Maximum 200 mots par réponse.
6. Sois précis, utile et cohérent avec ta personnalité.`;
    return prompt;
  }
}

module.exports = new MessageHandler();
