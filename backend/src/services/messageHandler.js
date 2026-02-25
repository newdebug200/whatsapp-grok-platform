const axios = require('axios');
const predefinedRules = require('../config/predefinedRules');

class MessageHandler {
  async handleIncomingMessage(message, client, prisma) {
    try {
      // IGNORER LES STATUTS WHATSAPP
      if (message.from === 'status@broadcast' || message.from.includes('@broadcast')) {
        console.log('📱 Statut WhatsApp ignoré:', message.body?.substring(0, 30));
        return;
      }

      // IGNORER LES MESSAGES DES GROUPES
      if (message.from.includes('@g.us')) {
        console.log('👥 Message de groupe ignoré:', message.from);
        return;
      }

      // Vérifier/Créer l'utilisateur
      let user = await prisma.user.findUnique({
        where: { phone_number: message.from }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            phone_number: message.from,
            name: message.author || message.from
          }
        });
      }

      // Sauvegarder le message reçu
      await prisma.message.create({
        data: {
          user_id: user.id,
          content: message.body || '',
          direction: 'received',
          type: message.hasMedia ? 'other' : 'text',
          created_at: new Date(message.timestamp * 1000)
        }
      });

      // Si ce n'est pas un message texte
      if (message.hasMedia) {
        const response = "Nous ne traitons que les messages textes. Merci d'écrire votre message.";
        await client.sendMessage(message.from, response);
        
        await prisma.message.create({
          data: {
            user_id: user.id,
            content: response,
            direction: 'sent',
            type: 'text',
            created_at: new Date()
          }
        });
        return;
      }

      // Traitement du message texte
      await this.processTextMessage(message, user, client, prisma);

    } catch (error) {
      console.error('Erreur traitement message:', error);
    }
  }

  async processTextMessage(message, user, client, prisma) {
    const normalizedMessage = message.body.toLowerCase().trim();
    
    // Récupérer la configuration
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 }
    });
    
    const iaEnabled = config?.ia_enabled !== false;
    const whatsappConfirmEnabled = config?.whatsapp_confirm_enabled !== false;
    
    // LOGIQUE AMÉLIORÉE POUR CONFIRMATION WHATSAPP
    
    // 1. Vérifier si c'est un message de confirmation WhatsApp
    const isWhatsAppConfirm = normalizedMessage.includes('confirmation whatsapp') || 
                              normalizedMessage.includes('whatsapp confirmation');
    
    if (isWhatsAppConfirm) {
      // Si la confirmation WhatsApp est activée, on la traite
      if (whatsappConfirmEnabled) {
        await this.handleWhatsAppConfirmation(message, user, client, prisma);
        return;
      } else {
        // Si désactivée, on ignore complètement le message (pas de réponse)
        console.log('🔕 WhatsApp Confirmation désactivée - message ignoré');
        
        // Optionnel: Sauvegarder que le message a été ignoré dans les logs
        await prisma.message.create({
          data: {
            user_id: user.id,
            content: `[MESSAGE IGNORÉ - WhatsApp Confirmation désactivée]`,
            direction: 'system',
            type: 'text',
            created_at: new Date()
          }
        });
        
        // NE RIEN ENVOYER - on sort sans réponse
        return;
      }
    }
    
    // Vérifier les règles prédéfinies
    for (const rule of predefinedRules) {
      if (rule.triggers.some(trigger => 
        normalizedMessage.includes(trigger.toLowerCase())
      )) {
        await client.sendMessage(message.from, rule.response);
        
        await prisma.message.create({
          data: {
            user_id: user.id,
            content: rule.response,
            direction: 'sent',
            type: 'text',
            created_at: new Date()
          }
        });
        return;
      }
    }

    // Si IA activée, utiliser Groq
    if (iaEnabled) {
      await this.callGroqAPI(message, user, client, prisma);
    } else {
      // Si IA désactivée, message par défaut
      console.log('🤖 IA désactivée - envoi message par défaut');
      const defaultMessage = "Merci pour votre message. Un conseiller vous répondra bientôt.";
      await client.sendMessage(message.from, defaultMessage);
      
      await prisma.message.create({
        data: {
          user_id: user.id,
          content: defaultMessage,
          direction: 'sent',
          type: 'text',
          created_at: new Date()
        }
      });
    }
  }

  async handleWhatsAppConfirmation(message, user, client, prisma) {
    try {
      console.log('📞 Traitement de WhatsApp Confirmation pour:', message.from);
      
      let phoneNumber = message.from.split('@')[0];
      phoneNumber = phoneNumber.replace('+', '');
      
      console.log('🔢 Numéro formaté:', phoneNumber);
      
      const apiUrl = `https://dressur.site/crud/user/find_whatsapp_is_activatable/${phoneNumber}`;
      console.log('🌐 Appel API:', apiUrl);
      
      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WhatsApp-Groq-Bot/1.0'
        }
      });
      
      console.log('✅ Réponse API reçue:', response.data);
      
      let messageToSend = "";
      
      if (response.data && typeof response.data === 'object') {
        if (response.data.message) {
          messageToSend = response.data.message;
        } else if (response.data.status === 'success' && response.data.data) {
          messageToSend = response.data.data.message || JSON.stringify(response.data.data);
        } else if (response.data.response) {
          messageToSend = response.data.response;
        } else {
          messageToSend = JSON.stringify(response.data);
        }
      } else {
        messageToSend = response.data;
      }
      
      await client.sendMessage(message.from, messageToSend);
      
      await prisma.message.create({
        data: {
          user_id: user.id,
          content: messageToSend,
          direction: 'sent',
          type: 'text',
          created_at: new Date()
        }
      });
      
      console.log('📨 Réponse WhatsApp Confirmation envoyée');
      
    } catch (error) {
      console.error('❌ Erreur WhatsApp Confirmation:', error.message);
      
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      } else if (error.request) {
        console.error('Pas de réponse reçue de l\'API');
      }
      
      const errorMessage = "Désolé, le service de confirmation WhatsApp est temporairement indisponible. Veuillez réessayer plus tard ou contacter le support.";
      
      await client.sendMessage(message.from, errorMessage);
      
      await prisma.message.create({
        data: {
          user_id: user.id,
          content: errorMessage,
          direction: 'sent',
          type: 'text',
          created_at: new Date()
        }
      });
    }
  }

  async callGroqAPI(message, user, client, prisma) {
    try {
      console.log('📞 Appel à l\'API Groq pour le message:', message.body.substring(0, 50));
      
      const recentMessages = await prisma.message.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
        take: 50
      });

      const faqs = await prisma.fAQ.findMany();
      const config = await prisma.appConfig.findUnique({
        where: { id: 1 }
      });

      const dressurDescription = config?.full_description || '';
      const prompt = this.buildPrompt(
        message.body,
        recentMessages.reverse(),
        faqs,
        dressurDescription
      );

      console.log('🚀 Envoi de la requête à Groq...');

      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: 'Vous êtes un assistant pour Dressur. Répondez en texte brut uniquement, sans HTML, JSON ou formatage spécial. Soyez naturel, amical et encouragez les services Dressur.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log('✅ Réponse reçue de Groq');

      const aiResponse = response.data.choices[0].message.content;
      await client.sendMessage(message.from, aiResponse);
      
      await prisma.message.create({
        data: {
          user_id: user.id,
          content: aiResponse,
          direction: 'sent',
          type: 'text',
          created_at: new Date()
        }
      });

      console.log('📨 Réponse envoyée avec succès');

    } catch (error) {
      console.error('❌ Erreur API Groq:', error.message);
      
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      
      await this.fallbackResponse(message, user, client, prisma);
    }
  }

  async fallbackResponse(message, user, client, prisma) {
    try {
      console.log('📋 Utilisation du mode fallback...');
      
      const faqs = await prisma.fAQ.findMany();
      const config = await prisma.appConfig.findUnique({
        where: { id: 1 }
      });
      
      let response = "";
      
      const normalizedMessage = message.body.toLowerCase();
      const matchingFaq = faqs.find(faq => 
        normalizedMessage.includes(faq.question.toLowerCase().substring(0, 20))
      );
      
      if (matchingFaq) {
        response = matchingFaq.answer;
      } else if (config?.full_description) {
        response = "Merci pour votre message. Je suis l'assistant virtuel de Dressur. " +
                   "Je peux vous renseigner sur nos services. " +
                   "Que souhaitez-vous savoir exactement ?";
      } else {
        response = "Bonjour ! Je suis l'assistant de Dressur. Comment puis-je vous aider aujourd'hui ?";
      }
      
      await client.sendMessage(message.from, response);
      
      await prisma.message.create({
        data: {
          user_id: user.id,
          content: response,
          direction: 'sent',
          type: 'text',
          created_at: new Date()
        }
      });
      
    } catch (fallbackError) {
      console.error('❌ Erreur fallback:', fallbackError);
      const emergencyResponse = "Merci pour votre message. Un conseiller vous répondra bientôt.";
      await client.sendMessage(message.from, emergencyResponse);
    }
  }

  buildPrompt(currentMessage, recentMessages, faqs, dressurDescription) {
    let prompt = `Description de Dressur: ${dressurDescription}\n\n`;
    
    prompt += `FAQ disponibles:\n`;
    faqs.forEach(faq => {
      prompt += `Q: ${faq.question}\nR: ${faq.answer}\n`;
    });

    prompt += `\nHistorique de la conversation:\n`;
    recentMessages.forEach(msg => {
      const role = msg.direction === 'received' ? 'Client' : 'Assistant';
      prompt += `${role}: ${msg.content}\n`;
    });

    prompt += `\nMessage actuel du client: ${currentMessage}\n\n`;
    prompt += `Instructions: Répondez de manière naturelle en aidant le client, en résolvant son problème, et en promouvant les services Dressur si pertinent. Réponse en texte brut uniquement.`;

    return prompt;
  }
}

module.exports = new MessageHandler();