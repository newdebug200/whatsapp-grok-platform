const axios = require('axios');

class MessageHandler {
  constructor() {
    // key: `${profileId}_${contactId}` -> { messages, timer, contact, client, prisma, profileId, from }
    this.pendingMessages = new Map();
    this.DELAY_MS = 5 * 60 * 1000; // 5 minutes
  }

  async handleIncomingMessage(message, client, prisma, profileId) {
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

      let dbContact = await prisma.contact.findUnique({
        where: {
          profile_id_phone_number: {
            profile_id: profileId,
            phone_number: phoneNumber
          }
        }
      });

      if (!dbContact) {
        dbContact = await prisma.contact.create({
          data: {
            profile_id: profileId,
            phone_number: phoneNumber,
            name: contactName
          }
        });
      } else if (contactName && dbContact.name !== contactName) {
        dbContact = await prisma.contact.update({
          where: { id: dbContact.id },
          data: { name: contactName }
        });
      }

      await prisma.message.create({
        data: {
          contact_id: dbContact.id,
          content: message.body || '',
          direction: 'received',
          type: message.hasMedia ? 'other' : 'text',
          created_at: new Date(message.timestamp * 1000)
        }
      });

      if (dbContact.ia_paused) {
        console.log(`Contact ${phoneNumber}: prise en main humaine active, réponse IA désactivée`);
        return;
      }

      if (message.hasMedia) {
        const response = "Je traite uniquement les messages texte. Merci de m'écrire votre demande en texte.";
        await client.sendMessage(message.from, response);
        await prisma.message.create({
          data: {
            contact_id: dbContact.id,
            content: response,
            direction: 'sent',
            type: 'text',
            created_at: new Date()
          }
        });
        return;
      }

      this._queueMessage(message.body || '', message.from, dbContact, client, prisma, profileId);

    } catch (error) {
      console.error('Erreur traitement message:', error);
    }
  }

  _queueMessage(body, from, contact, client, prisma, profileId) {
    const key = `${profileId}_${contact.id}`;

    if (this.pendingMessages.has(key)) {
      const pending = this.pendingMessages.get(key);
      clearTimeout(pending.timer);
      pending.messages.push(body);
      console.log(`Message ajouté à la file pour ${from} (${pending.messages.length} messages en attente) — timer remis à zéro`);
    } else {
      this.pendingMessages.set(key, {
        messages: [body],
        timer: null,
        contact,
        client,
        prisma,
        profileId,
        from
      });
      console.log(`Nouveau message en file pour ${from} — réponse dans 5 min si pas de nouveau message`);
    }

    const pending = this.pendingMessages.get(key);
    pending.timer = setTimeout(async () => {
      this.pendingMessages.delete(key);
      const concatenated = pending.messages.join('\n');
      console.log(`Traitement de ${pending.messages.length} message(s) pour ${pending.from}`);
      await this._processTextMessage(concatenated, pending.contact, pending.client, pending.prisma, pending.profileId, pending.from);
    }, this.DELAY_MS);
  }

  async _processTextMessage(messageText, contact, client, prisma, profileId, from) {
    try {
      const freshContact = await prisma.contact.findUnique({ where: { id: contact.id } });
      if (freshContact?.ia_paused) {
        console.log(`Contact ${from}: prise en main humaine active au moment de l'envoi, réponse IA annulée`);
        return;
      }

      const botConfig = await prisma.botConfig.findUnique({
        where: { profile_id: profileId }
      });

      if (!botConfig || !botConfig.ia_enabled) {
        console.log(`Profil ${profileId}: bot IA désactivé, aucune réponse envoyée.`);
        return;
      }

      const faqs = await prisma.fAQ.findMany({ where: { profile_id: profileId } });
      const hasInfo =
        (botConfig.bot_info && botConfig.bot_info.trim().length > 0) ||
        faqs.length > 0;

      if (!hasInfo) {
        console.log(`Profil ${profileId}: aucune FAQ ni bot_info configurés — réponse IA annulée.`);
        return;
      }

      await this._callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs);
    } catch (error) {
      console.error('Erreur processTextMessage:', error);
    }
  }

  async _callGroqAPI(messageText, contact, client, prisma, profileId, botConfig, from, faqs) {
    try {
      const recentMessages = await prisma.message.findMany({
        where: { contact_id: contact.id },
        orderBy: { created_at: 'desc' },
        take: 10
      });

      const botName = botConfig.bot_name || 'Botora';
      const botInfo = botConfig.bot_info || '';
      const botBehavior = botConfig.bot_behavior || '';

      const systemPrompt = this._buildSystemPrompt(botName, botInfo, botBehavior);
      const userPrompt = this._buildUserPrompt(messageText, recentMessages.reverse(), faqs);

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
      await prisma.message.create({
        data: {
          contact_id: contact.id,
          content: aiResponse,
          direction: 'sent',
          type: 'text',
          created_at: new Date()
        }
      });

      console.log(`Réponse IA envoyée à ${from} pour le profil ${profileId}`);
    } catch (error) {
      console.error('Erreur API Groq:', error.message);
    }
  }

  _buildSystemPrompt(botName, botInfo, botBehavior) {
    let prompt = `Tu es ${botName}, un assistant intelligent sur WhatsApp.\n\n`;

    if (botInfo && botInfo.trim()) {
      prompt += `📋 INFORMATIONS SUR TON DOMAINE :\n${botInfo}\n\n`;
    }

    if (botBehavior && botBehavior.trim()) {
      prompt += `🎯 RÈGLES DE COMPORTEMENT :\n${botBehavior}\n\n`;
    }

    prompt += `⚙️ RÈGLES STRICTES À TOUJOURS RESPECTER :
1. Tu réponds UNIQUEMENT selon les informations fournies ci-dessus.
2. Si une question dépasse tes informations, réponds : "Je n'ai pas l'information pour répondre à cela, mais je peux vous orienter vers un conseiller."
3. Tu n'inventes JAMAIS d'informations que tu n'as pas.
4. Tu restes strictement dans le cadre de ton domaine.
5. Réponses en texte brut uniquement (pas de HTML, pas de JSON, pas de markdown complexe).
6. Maximum 200 mots par réponse.
7. Sois précis, utile et courtois.
8. Si tu ne sais pas : dis-le clairement plutôt que d'inventer.`;

    return prompt;
  }

  _buildUserPrompt(currentMessage, recentMessages, faqs) {
    let prompt = '';

    if (faqs.length > 0) {
      prompt += `FAQ disponibles :\n`;
      faqs.forEach(faq => {
        prompt += `Q: ${faq.question}\nR: ${faq.answer}\n`;
      });
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
