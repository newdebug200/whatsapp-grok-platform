'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const centralSync = require('./centralSync');
const messageHandler = require('./messageHandler');

test('persists and emits an incoming WhatsApp message only once by WhatsApp ID', async (t) => {
  const originalFeature = centralSync.getFeature;
  const originalKeywordHandler = messageHandler._handleKeywordAutoReply;
  const dbContact = {
    id: 21,
    profile_id: 3,
    phone_number: '+15551234567',
    wa_id: '15551234567@c.us',
    name: 'Alice'
  };
  const savedMessages = [];
  const unreadUpdates = [];
  const emittedMessages = [];
  t.after(() => {
    centralSync.getFeature = originalFeature;
    messageHandler._handleKeywordAutoReply = originalKeywordHandler;
  });

  centralSync.getFeature = async () => false;
  messageHandler._handleKeywordAutoReply = async () => false;
  const prisma = {
    contact: {
      findUnique: async () => dbContact,
      update: async args => { unreadUpdates.push(args); return dbContact; }
    },
    message: {
      findFirst: async ({ where }) => savedMessages.find(message => (
        message.contact_id === where.contact_id && message.wa_msg_id === where.wa_msg_id
      )) || null,
      create: async ({ data }) => {
        const saved = { id: savedMessages.length + 1, ...data };
        savedMessages.push(saved);
        return saved;
      }
    },
    botConfig: { findUnique: async () => ({}) },
    whatsAppProfile: { findUnique: async () => null },
    verificationTrigger: { findMany: async () => [] },
    sensitiveKeyword: { findMany: async () => [] }
  };
  const waManager = {
    addToCache: () => {},
    emitNewMessage: (_profileId, payload) => emittedMessages.push(payload)
  };
  const message = {
    from: '15551234567@c.us',
    fromMe: false,
    body: 'Hello Botora',
    type: 'chat',
    timestamp: Math.floor(Date.now() / 1000),
    id: { _serialized: 'false_15551234567@c.us_incoming-123' },
    hasMedia: false,
    getContact: async () => ({
      number: '15551234567',
      name: 'Alice',
      pushname: 'Alice',
      id: { user: '15551234567' }
    })
  };

  await messageHandler.handleIncomingMessage(message, {}, prisma, 3, waManager, { skipAI: true });
  await messageHandler.handleIncomingMessage(message, {}, prisma, 3, waManager, { skipAI: true });

  assert.equal(savedMessages.length, 1);
  assert.equal(savedMessages[0].wa_msg_id, message.id._serialized);
  assert.equal(savedMessages[0].content, message.body);
  assert.equal(unreadUpdates.length, 1);
  assert.equal(emittedMessages.length, 1);
  assert.equal(emittedMessages[0].contactId, dbContact.id);
  assert.equal(emittedMessages[0].messageId, message.id._serialized);
});
