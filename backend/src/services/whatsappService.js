const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const messageHandler = require('./messageHandler');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.io = null;
    this.prisma = null;
    this.qrCode = null;
  }

  initialize(io, prisma) {
    this.io = io;
    this.prisma = prisma;

    const sessionPath = path.join(__dirname, '../../.wwebjs_auth');
    
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionPath
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.client.on('qr', (qr) => {
      console.log('QR Code reçu');
      this.qrCode = qr;
      qrcode.generate(qr, { small: true });
      this.io.emit('qr', qr);
    });

    this.client.on('ready', () => {
      console.log('Client WhatsApp prêt !');
      this.qrCode = null;
      this.io.emit('ready', { status: 'connected' });
      this.loadExistingChats();
    });

    this.client.on('message', async (message) => {
      await messageHandler.handleIncomingMessage(message, this.client, this.prisma);
      this.io.emit('new-message', {
        from: message.from,
        body: message.body,
        timestamp: message.timestamp
      });
    });

    this.client.on('disconnected', (reason) => {
      console.log('Client déconnecté:', reason);
      this.io.emit('disconnected', { reason });
    });

    this.client.initialize();
  }

  async loadExistingChats() {
    const chats = await this.client.getChats();
    for (const chat of chats) {
      const messages = await chat.fetchMessages({ limit: 50 });
      
      // Sauvegarder les messages en base
      for (const msg of messages) {
        await this.saveMessageToDatabase(msg);
      }
    }
  }

  async saveMessageToDatabase(message) {
    try {
      // Vérifier/Créer l'utilisateur
      let user = await this.prisma.user.findUnique({
        where: { phone_number: message.from }
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phone_number: message.from,
            name: message.author || message.from
          }
        });
      }

      // Sauvegarder le message
      await this.prisma.message.create({
        data: {
          user_id: user.id,
          content: message.body || '',
          direction: message.fromMe ? 'sent' : 'received',
          type: this.getMessageType(message),
          created_at: new Date(message.timestamp * 1000)
        }
      });
    } catch (error) {
      console.error('Erreur sauvegarde message:', error);
    }
  }

  getMessageType(message) {
    if (message.hasMedia) {
      if (message.type === 'image') return 'image';
      if (message.type === 'audio') return 'audio';
      if (message.type === 'video') return 'video';
      return 'other';
    }
    return 'text';
  }

  async sendMessage(to, content) {
    try {
      await this.client.sendMessage(to, content);
      
      // Sauvegarder le message envoyé
      const user = await this.prisma.user.findUnique({
        where: { phone_number: to }
      });

      if (user) {
        await this.prisma.message.create({
          data: {
            user_id: user.id,
            content: content,
            direction: 'sent',
            type: 'text',
            created_at: new Date()
          }
        });
      }
    } catch (error) {
      console.error('Erreur envoi message:', error);
    }
  }

  async logout() {
    try {
      await this.client.logout();
      this.qrCode = null;
      this.io.emit('disconnected', { reason: 'manual_logout' });
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
  }

  getStatus() {
    return {
      isConnected: this.client?.info ? true : false,
      qrCode: this.qrCode
    };
  }
}

module.exports = new WhatsAppService();