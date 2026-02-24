const axios = require('axios');
const predefinedRules = require('../config/predefinedRules');

class MessageHandler {
  async handleIncomingMessage(message, client, prisma) {
    try {
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

    // Si aucune règle trouvée, utiliser Groq
    await this.callGroqAPI(message, user, client, prisma);
  }

  async callGroqAPI(message, user, client, prisma) {
    try {
      console.log('📞 Appel à l\'API Groq pour le message:', message.body.substring(0, 50));
      
      // Récupérer les 50 derniers messages
      const recentMessages = await prisma.message.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
        take: 50
      });

      // Récupérer toutes les FAQ
      const faqs = await prisma.fAQ.findMany();

      // Récupérer la description Dressur
      const config = await prisma.appConfig.findUnique({
        where: { id: 1 }
      });

      const dressurDescription = config?.full_description || '';

      // Construire le prompt
      const prompt = this.buildPrompt(
        message.body,
        recentMessages.reverse(),
        faqs,
        dressurDescription
      );

      console.log('🚀 Envoi de la requête à Groq...');

      // Appel à l'API Groq (URL corrigée)
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile', // Modèle qui fonctionne avec votre test
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

      // Envoyer la réponse
      await client.sendMessage(message.from, aiResponse);
      
      // Sauvegarder la réponse
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
      
      // Utiliser le fallback en cas d'erreur
      await this.fallbackResponse(message, user, client, prisma);
    }
  }

  // Nouvelle méthode de fallback en cas d'erreur API
  async fallbackResponse(message, user, client, prisma) {
    try {
      console.log('📋 Utilisation du mode fallback...');
      
      // Récupérer les FAQ pour répondre intelligemment
      const faqs = await prisma.fAQ.findMany();
      const config = await prisma.appConfig.findUnique({
        where: { id: 1 }
      });
      
      let response = "";
      
      // Chercher une FAQ correspondante
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