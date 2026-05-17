const axios = require('axios');

class MessageHandler {
  constructor() {
    this.pendingMessages = new Map();
  }

  async handleIncomingMessage(message, client, prisma, profileId, waManager) {
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

      prisma.message.create({
        data: {
          contact_id: dbContact.id,
          content: mediaTypeLabel ? `[${mediaTypeLabel}]` : (message.body || ''),
          direction: 'received',
          type: message.type || 'text',
          created_at: new Date(message.timestamp * 1000)
        }
      }).catch(err => console.error('[DB] Erreur save message:', err.message));

      if (!message.hasMedia) {
        waManager.addToCache(profileId, dbContact.id, 'received', message.body || '');
      }

      if (dbContact.ia_paused) {
        console.log(`Contact ${phoneNumber}: prise en main humaine active, réponse IA désactivée`);
        return;
      }

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
      this._queueMessage(message.body || '', waId, dbContact, client, prisma, profileId, waManager, delayMs, botConfig);
    } catch (error) {
      console.error('Erreur traitement message:', error);
    }
  }

  _queueMessage(body, from, contact, client, prisma, profileId, waManager, delayMs, botConfig) {
    const key = `${profileId}_${contact.id}`;

    if (this.pendingMessages.has(key)) {
      const pending = this.pendingMessages.get(key);
      clearTimeout(pending.timer);
      pending.messages.push(body);
      console.log(`Message ajouté à la file pour ${from} (${pending.messages.length} messages en attente) — timer remis à zéro`);
    } else {
      this.pendingMessages.set(key, { messages: [body], timer: null, contact, client, prisma, profileId, from, waManager, delayMs, botConfig });
      console.log(`Nouveau message en file pour ${from} — réponse dans ${delayMs / 1000}s si pas de nouveau message`);
    }

    const pending = this.pendingMessages.get(key);
    pending.timer = setTimeout(async () => {
      this.pendingMessages.delete(key);
      const concatenated = pending.messages.join('\n');
      console.log(`Traitement de ${pending.messages.length} message(s) pour ${pending.from}`);
      await this._processTextMessage(
        concatenated, pending.contact, pending.client, pending.prisma,
        pending.profileId, pending.from, pending.waManager, pending.botConfig
      );
    }, delayMs);
  }

  async _processTextMessage(messageText, contact, client, prisma, profileId, from, waManager, cachedBotConfig) {
    try {
      const freshContact = await prisma.contact.findUnique({ where: { id: contact.id } });
      if (freshContact?.ia_paused) {
        console.log(`Contact ${from}: prise en main humaine active au moment de l'envoi, réponse IA annulée`);
        return;
      }

      const botConfig = cachedBotConfig || await prisma.botConfig.findUnique({ where: { profile_id: profileId } });
      if (!botConfig || !botConfig.ia_enabled) {
        console.log(`Profil ${profileId}: bot IA désactivé, aucune réponse envoyée.`);
        return;
      }

      const faqs = await prisma.fAQ.findMany({ where: { profile_id: profileId } });
      const hasInfo = (botConfig.bot_info?.trim().length > 0) || faqs.length > 0;
      if (!hasInfo) {
        console.log(`Profil ${profileId}: aucune FAQ ni bot_info configurés — réponse IA annulée.`);
        return;
      }

      let recentMessages = waManager.getFromCache(profileId, contact.id);
      if (recentMessages.length === 0) {
        const dbMessages = await prisma.message.findMany({
          where: { contact_id: contact.id },
          orderBy: { created_at: 'asc' },
          take: 15
        });
        recentMessages = dbMessages.map(m => ({ direction: m.direction, content: m.content }));
        for (const m of recentMessages) waManager.addToCache(profileId, contact.id, m.direction, m.content);
      }

      await this._callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs, recentMessages, waManager);
    } catch (error) {
      console.error('Erreur processTextMessage:', error);
    }
  }

  async _callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs, recentMessages, waManager) {
    try {
      const systemPrompt = this._buildSystemPrompt(botConfig.bot_name, botConfig.bot_info, botConfig.bot_behavior);
      const userPrompt = this._buildUserPrompt(messageText, recentMessages, faqs);

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 400
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      await client.sendMessage(from, aiResponse);
      waManager.addToCache(profileId, contact.id, 'sent', aiResponse);
      prisma.message.create({
        data: { contact_id: contact.id, content: aiResponse, direction: 'sent', type: 'text', created_at: new Date() }
      }).catch(() => {});
      console.log(`Réponse IA envoyée à ${from} pour le profil ${profileId}`);
    } catch (error) {
      console.error('Erreur API Groq:', error.message);
      waManager.emitToProfileAccount(profileId, 'bot-error', {
        profileId,
        contactPhone: contact.phone_number || from,
        error: "Le bot IA n'a pas pu répondre. Vérifiez votre clé API Groq dans le fichier .env."
      });
    }
  }

  _buildSystemPrompt(botName, botInfo, botBehavior) {
    let prompt = `Tu es ${botName || 'Botora'}, un assistant intelligent sur WhatsApp.\n\n`;
    if (botInfo?.trim()) prompt += `📋 INFORMATIONS SUR TON DOMAINE :\n${botInfo}\n\n`;
    if (botBehavior?.trim()) prompt += `🎯 RÈGLES DE COMPORTEMENT :\n${botBehavior}\n\n`;
    prompt += `⚙️ RÈGLES STRICTES :
1. Tu réponds UNIQUEMENT selon les informations fournies ci-dessus.
2. Si une question dépasse tes informations, réponds : "Je n'ai pas l'information pour répondre à cela, mais je peux vous orienter vers un conseiller."
3. Tu n'inventes JAMAIS d'informations.
4. Réponses en texte brut uniquement (pas de HTML, pas de markdown complexe).
5. Maximum 200 mots par réponse.
6. Sois précis, utile et courtois.`;
    return prompt;
  }

  _buildUserPrompt(currentMessage, recentMessages, faqs) {
    let prompt = '';
    if (faqs.length > 0) {
      prompt += `FAQ disponibles :\n`;
      faqs.forEach(faq => { prompt += `Q: ${faq.question}\nR: ${faq.answer}\n`; });
      prompt += '\n';
    }
    if (recentMessages.length > 0) {
      prompt += `Historique récent :\n`;
      recentMessages.forEach(msg => {
        const role = msg.direction === 'received' ? 'Utilisateur' : 'Assistant';
        prompt += `${role}: ${msg.content}\n`;
      });
      prompt += '\n';
    }
    prompt += `Message(s) de l'utilisateur :\n${currentMessage}`;
    return prompt;
  }
}

module.exports = new MessageHandler();
