const axios = require('axios');

const PERSONALITY_PROMPTS = {
  professionnel: "Style formel et professionnel. Langage soigné, vouvoiement. Pas d'emojis sauf si le contexte le demande. Réponses précises et structurées.",
  amical: "Style chaleureux, amical et accessible. Vouvoiement poli. Quelques emojis bienvenus pour rendre la conversation vivante. Ton positif et encourageant.",
  commercial: "Style orienté vente et conversion. Mets en avant les bénéfices, crée un sentiment d'urgence subtil, guide naturellement le client vers l'action (achat, rendez-vous, contact). Sois persuasif mais honnête.",
  support: "Style empathique et patient. Tu es avant tout là pour résoudre les problèmes. Reformule les questions du client pour montrer que tu comprends. Propose des solutions concrètes et reste calme en toutes circonstances."
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
    try { tzDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz })); }
    catch (_) { tzDate = new Date(); }
    const dayOfWeek = tzDate.getDay();
    const openDays = (botConfig.open_days || '1,2,3,4,5').split(',').map(Number);
    if (!openDays.includes(dayOfWeek)) return false;
    const currentMinutes = tzDate.getHours() * 60 + tzDate.getMinutes();
    const [openH, openM] = (botConfig.open_time || '09:00').split(':').map(Number);
    const [closeH, closeM] = (botConfig.close_time || '18:00').split(':').map(Number);
    return currentMinutes >= (openH * 60 + openM) && currentMinutes < (closeH * 60 + closeM);
  }

  async handleIncomingMessage(message, client, prisma, profileId, waManager, options = {}) {
    const { skipAI = false } = options;
    try {
      if (message.fromMe) return;
      if (message.from === 'status@broadcast' || message.from.includes('@broadcast')) return;
      if (message.from.includes('@g.us')) return;

      const messageAgeMs = Date.now() - message.timestamp * 1000;
      if (messageAgeMs > 60000) {
        console.log(`Message ignoré (trop ancien: ${Math.round(messageAgeMs / 1000)}s) de ${message.from}`);
        return;
      }

      const contact = await message.getContact();
      const phoneNumber = '+' + (contact.number || contact.id.user);
      const contactName = contact.name || contact.pushname || null;
      const waId = message.from;

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
        ? (message.type === 'image' ? 'Image'
          : message.type === 'video' ? 'Vidéo'
          : message.type === 'audio' || message.type === 'ptt' ? 'Audio'
          : message.type === 'document' ? 'Document'
          : message.type === 'sticker' ? 'Sticker'
          : 'Fichier')
        : null;

      const msgContent = mediaTypeLabel ? `[${mediaTypeLabel}]` : (message.body || '');

      prisma.message.create({
        data: {
          contact_id: dbContact.id,
          content: msgContent,
          direction: 'received',
          type: message.type || 'text',
          created_at: new Date()
        }
      }).catch(() => {});

      // Increment unread_count for the contact (fire-and-forget)
      prisma.contact.update({
        where: { id: dbContact.id },
        data: { unread_count: { increment: 1 } }
      }).catch(() => {});

      waManager.addToCache(profileId, dbContact.id, 'received', msgContent);

      // Emit unread count — use dbContact (pre-increment) value + 1 to avoid race condition
      waManager.emitToProfileAccount(profileId, 'unread-update', {
        contactId: dbContact.id,
        unread_count: (dbContact.unread_count || 0) + 1
      });

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
        if (!isAdminAccount && account?.is_blocked) {
          console.log(`[Block] Compte ${profile.account_id} bloqué — traitement du message annulé.`);
          return;
        }
      }

      // ── Check global IA feature flag ──
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

      if (message.hasMedia) {
        const label = mediaTypeLabel?.toLowerCase() || 'fichier';
        const response = `Je reçois votre ${label} mais je ne traite que les messages texte. Merci de reformuler votre demande par écrit.`;
        await client.sendMessage(waId, response);
        waManager.addToCache(profileId, dbContact.id, 'sent', response);
        prisma.message.create({
          data: { contact_id: dbContact.id, content: response, direction: 'sent', type: 'text', created_at: new Date() }
        }).catch(() => {});
        return;
      }

      const botConfig = await prisma.botConfig.findUnique({ where: { profile_id: profileId } });
      const delayMs = (botConfig?.response_delay_seconds ?? 5) * 1000;

      // Async sentiment analysis (non-blocking, doesn't wait for result)
      if (message.body && botConfig?.sentiment_alert !== false) {
        const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
        if (apiKey) {
          this._analyzeSentiment(message.body, dbContact, prisma, profileId, apiKey, waManager).catch(() => {});
        }
      }

      this._queueMessage(message.body || '', waId, dbContact, client, prisma, profileId, waManager, delayMs, botConfig);
    } catch (error) {
      console.error('Erreur traitement message:', error);
    }
  }

  // ── Sentiment analysis (async, non-blocking) ──
  async _analyzeSentiment(messageText, contact, prisma, profileId, apiKey, waManager) {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'Analyse le sentiment de ce message WhatsApp reçu. Réponds UNIQUEMENT avec un JSON compact sur une ligne: {"sentiment":"positive","neutral","negative","angry","escalate":true ou false}. escalate=true si le client est clairement en colère ou très mécontent et nécessite une intervention humaine urgente.'
            },
            { role: 'user', content: messageText.slice(0, 500) }
          ],
          temperature: 0,
          max_tokens: 60
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      const text = response.data.choices[0]?.message?.content || '{}';
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]);
      const sentiment = ['positive', 'neutral', 'negative', 'angry'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
      const escalate = parsed.escalate === true;

      await prisma.contact.update({ where: { id: contact.id }, data: { sentiment } });

      if ((sentiment === 'negative' || sentiment === 'angry') && escalate && !contact.sensitive_flagged) {
        await prisma.contact.update({ where: { id: contact.id }, data: { ia_paused: true, sensitive_flagged: true } });
        waManager.emitToProfileAccount(profileId, 'sentiment-alert', {
          profileId,
          contactPhone: contact.phone_number,
          contactName: contact.name,
          sentiment,
          message: messageText.slice(0, 200)
        });
        console.log(`[Sentiment] Contact ${contact.phone_number} — sentiment: ${sentiment}, escalade humaine déclenchée`);
      }
    } catch (_) {}
  }

  // ── Memory update (async, non-blocking) ──
  async _updateMemory(contact, prisma, recentMessages, apiKey) {
    try {
      if (recentMessages.length < 6) return;
      const history = recentMessages
        .slice(-12)
        .filter(m => !/^\[(Image|Vidéo|Audio|Document|Sticker|Fichier)\]$/.test(m.content))
        .map(m => `${m.direction === 'received' ? 'Client' : 'Bot'}: ${m.content}`)
        .join('\n');
      if (!history.trim()) return;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'Tu es un assistant mémoire. À partir de cet échange WhatsApp, génère un résumé TRÈS CONCIS (3-4 phrases max) de ce que le bot doit retenir sur ce contact : son profil, ses besoins, ses questions, ses préférences. Sois factuel et bref.'
            },
            { role: 'user', content: history }
          ],
          temperature: 0,
          max_tokens: 200
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      const memory = response.data.choices[0]?.message?.content;
      if (memory) {
        await prisma.contact.update({ where: { id: contact.id }, data: { ia_memory: memory } });
        console.log(`[Memory] Mémoire mise à jour pour ${contact.phone_number}`);
      }
    } catch (_) {}
  }

  async _handleVerificationTrigger(message, client, prisma, profileId, phoneNumber, waId, dbContact, waManager) {
    try {
      const verifyUrl = process.env.VERIFY_API_URL;
      if (!verifyUrl) return;
      const verifyResp = await axios.get(`${verifyUrl}?phone=${encodeURIComponent(phoneNumber)}`, { timeout: 10000 });
      const result = verifyResp.data;
      const replyText = result?.verified ? `✅ Numéro vérifié : ${phoneNumber}` : `❌ Numéro non vérifié : ${phoneNumber}`;
      await client.sendMessage(waId, replyText);
      waManager.addToCache(profileId, dbContact.id, 'sent', replyText);
      prisma.message.create({
        data: { contact_id: dbContact.id, content: replyText, direction: 'sent', type: 'text', created_at: new Date() }
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
          const shouldSend = !botConfig.away_once_per_session || !lastSent || (Date.now() - lastSent > 8 * 3600000);
          if (shouldSend) {
            this.awaySentMap.set(awayKey, Date.now());
            try {
              await client.sendMessage(from, awayMsg);
              waManager.addToCache(profileId, contact.id, 'sent', awayMsg);
              prisma.message.create({ data: { contact_id: contact.id, content: awayMsg, direction: 'sent', type: 'text', created_at: new Date() } }).catch(() => {});
            } catch (err) { console.error('[Heures bureau] Erreur:', err.message); }
          }
        }
        return;
      }

      const faqs = await prisma.fAQ.findMany({ where: { profile_id: profileId } });

      let recentMessages = waManager.getFromCache(profileId, contact.id);
      if (recentMessages.length === 0) {
        const dbMessages = await prisma.message.findMany({
          where: { contact_id: contact.id },
          orderBy: { created_at: 'asc' }
        });
        recentMessages = dbMessages.map(m => ({ direction: m.direction, content: m.content }));
        for (const m of recentMessages) waManager.addToCache(profileId, contact.id, m.direction, m.content);
      }

      await this._callGroqAPI(messageText, freshContact || contact, client, prisma, profileId, botConfig, from, faqs, recentMessages, waManager);
    } catch (error) {
      console.error('Erreur processTextMessage:', error);
    }
  }

  async _callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs, recentMessages, waManager) {
    const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

    if (!apiKey) {
      waManager.emitToProfileAccount(profileId, 'bot-error', {
        profileId, contactPhone: contact.phone_number || from,
        error: "Clé API Groq manquante. Ajoutez GROQ_API_KEY dans votre fichier .env."
      });
      return;
    }

    // ── Credit check ──
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
        if (creditsEnabled && !isAdminAccount && (accountRow?.credit_balance ?? 0) <= 0) {
          waManager.emitToProfileAccount(profileId, 'bot-error', {
            profileId, contactPhone: contact.phone_number || from,
            error: "⚠️ Votre solde de crédits est épuisé."
          });
          return;
        }
      }
    } catch (creditCheckErr) { console.error('[Credits] Erreur vérification solde:', creditCheckErr.message); }

    try {
      const systemPrompt = this._buildSystemPrompt(botConfig, faqs, contact.ia_memory);

      const historyMessages = recentMessages
        .filter(m => m.content && !/^\[(Image|Vidéo|Audio|Document|Sticker|Fichier)\]$/.test(m.content))
        .map(m => ({ role: m.direction === 'received' ? 'user' : 'assistant', content: m.content }));

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: messageText }
          ],
          temperature: 0.2,
          max_tokens: 400
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      const aiResponse = response.data.choices[0].message.content;
      const totalTokens = response.data.usage?.total_tokens || 0;

      await client.sendMessage(from, aiResponse);
      waManager.addToCache(profileId, contact.id, 'sent', aiResponse);
      prisma.message.create({
        data: { contact_id: contact.id, content: aiResponse, direction: 'sent', type: 'text', created_at: new Date() }
      }).catch(() => {});
      console.log(`Réponse IA envoyée à ${from} — profil ${profileId}`);

      // Async memory update every 5+ messages (non-blocking)
      if (botConfig.memory_enabled !== false && recentMessages.length % 5 === 0) {
        this._updateMemory(contact, prisma, [...recentMessages, { direction: 'sent', content: aiResponse }], apiKey).catch(() => {});
      }

      // ── Deduct credits ──
      if (creditsEnabled && accountId && totalTokens > 0) {
        try {
          const creditRateCfg = await prisma.platformConfig.findUnique({ where: { key: 'credit_per_1000_tokens' } });
          const creditRate = parseFloat(creditRateCfg?.value || '1');
          const creditsToDeduct = parseFloat(((totalTokens / 1000) * creditRate).toFixed(4));
          await prisma.$transaction([
            prisma.account.update({ where: { id: accountId }, data: { credit_balance: { decrement: creditsToDeduct } } }),
            prisma.creditTransaction.create({
              data: { account_id: accountId, amount: -creditsToDeduct, type: 'debit', description: `Réponse IA — ${totalTokens} tokens`, tokens_used: totalTokens }
            })
          ]);
        } catch (deductErr) { console.error('[Credits] Erreur déduction:', deductErr.message); }
      }
    } catch (error) {
      const status = error.response?.status;
      let errorMsg = "Le bot IA n'a pas pu répondre.";
      if (status === 401) errorMsg = "Clé API Groq invalide. Vérifiez GROQ_API_KEY dans le .env.";
      else if (status === 429) errorMsg = "Limite de quota Groq atteinte.";
      else if (status === 503 || status === 502) errorMsg = "API Groq temporairement indisponible.";
      else console.error('Erreur API Groq:', error.message);
      waManager.emitToProfileAccount(profileId, 'bot-error', { profileId, contactPhone: contact.phone_number || from, error: errorMsg });
    }
  }

  _buildSystemPrompt(botConfig, faqs = [], iaMemory = '') {
    const botName = botConfig.bot_name || 'Botora';
    const botInfo = botConfig.bot_info || '';
    const botBehavior = botConfig.bot_behavior || '';
    const personality = botConfig.personality || 'professionnel';
    const customPrompt = botConfig.custom_system_prompt || '';

    // If a fully custom prompt is provided, use it directly
    if (customPrompt.trim()) {
      return customPrompt
        .replace(/\{\{bot_name\}\}/g, botName)
        .replace(/\{\{bot_info\}\}/g, botInfo);
    }

    let prompt = `Tu es ${botName}, un assistant intelligent sur WhatsApp.\n\n`;

    // Personality style
    const personalityText = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.professionnel;
    prompt += `🎭 STYLE & PERSONNALITÉ :\n${personalityText}\n\n`;

    if (botInfo?.trim()) prompt += `📋 INFORMATIONS SUR TON DOMAINE :\n${botInfo}\n\n`;

    if (faqs.length > 0) {
      prompt += `📚 FAQ :\n`;
      faqs.forEach(faq => { prompt += `Q: ${faq.question}\nR: ${faq.answer}\n`; });
      prompt += '\n';
    }

    if (botBehavior?.trim()) prompt += `🎯 RÈGLES DE COMPORTEMENT :\n${botBehavior}\n\n`;

    // Inject contact memory if available
    if (iaMemory?.trim()) {
      prompt += `🧠 MÉMOIRE SUR CE CONTACT :\n${iaMemory}\n\n`;
    }

    prompt += `⚙️ RÈGLES STRICTES :
1. Tu réponds UNIQUEMENT selon les informations fournies ci-dessus.
2. Si une question dépasse tes informations, réponds : "Je n'ai pas l'information pour répondre à cela, mais je peux vous orienter vers un conseiller."
3. Tu n'inventes JAMAIS d'informations.
4. Réponses en texte brut uniquement (pas de HTML, pas de markdown complexe).
5. Maximum 200 mots par réponse.
6. Sois précis, utile et courtois.`;
    return prompt;
  }
}

module.exports = new MessageHandler();
