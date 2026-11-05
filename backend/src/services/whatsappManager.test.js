'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const whatsappManager = require('./whatsappManager');
const centralSync = require('./centralSync');

test('syncs existing WhatsApp groups and their recent messages for the groups filter', async (t) => {
  const originalPrisma = whatsappManager.prisma;
  const originalIO = whatsappManager.io;
  const originalIsSyncActive = whatsappManager._isSyncActive;
  const originalResolveName = whatsappManager._resolveChatContactName;
  const upsertedContacts = [];
  const savedMessages = [];
  const emittedEvents = [];
  const groupChat = {
    isGroup: true,
    id: { _serialized: '12345-67890@g.us' },
    isArchived: false,
    pinned: true,
    fetchMessages: async ({ limit }) => {
      assert.equal(limit, 50);
      return [{
        id: { _serialized: 'group-message-id' },
        body: 'Recent group message',
        type: 'chat',
        timestamp: 1_798_000_000,
        fromMe: false,
        hasMedia: false
      }];
    }
  };
  const client = {
    getChats: async () => [
      { isGroup: false, id: { _serialized: '123456789@c.us' } },
      groupChat
    ]
  };

  t.after(() => {
    whatsappManager.prisma = originalPrisma;
    whatsappManager.io = originalIO;
    whatsappManager._isSyncActive = originalIsSyncActive;
    whatsappManager._resolveChatContactName = originalResolveName;
  });

  whatsappManager._isSyncActive = () => true;
  whatsappManager._resolveChatContactName = async () => 'Botora Test Group';
  whatsappManager.prisma = {
    contact: {
      upsert: async (args) => {
        upsertedContacts.push(args);
        return { id: 45 };
      }
    },
    message: {
      findFirst: async () => null,
      create: async (args) => { savedMessages.push(args); }
    }
  };
  whatsappManager.io = {
    to: (room) => ({
      emit: (event, payload) => emittedEvents.push({ room, event, payload })
    })
  };

  await whatsappManager._syncGroupConversations(client, 7, 12, {});

  assert.equal(upsertedContacts.length, 1);
  assert.equal(upsertedContacts[0].where.profile_id_phone_number.phone_number, 'group_12345-67890');
  assert.equal(upsertedContacts[0].create.name, 'Botora Test Group');
  assert.equal(upsertedContacts[0].create.is_favorite, true);
  assert.equal(savedMessages.length, 1);
  assert.equal(savedMessages[0].data.contact_id, 45);
  assert.equal(savedMessages[0].data.content, 'Recent group message');
  assert.equal(savedMessages[0].data.unread, false);
  assert.deepEqual(emittedEvents[0], {
    room: 'account_12',
    event: 'sync-complete',
    payload: {
      profileId: 7,
      syncedChats: 1,
      syncedMessages: 1,
      message: 'Groupes WhatsApp synchronisés.'
    }
  });
});

test('matches legacy messages without WhatsApp IDs so their media can be backfilled', async (t) => {
  const originalPrisma = whatsappManager.prisma;
  const lookups = [];
  const legacyMessage = { id: 91, wa_msg_id: null, media_path: null };
  t.after(() => {
    whatsappManager.prisma = originalPrisma;
  });

  whatsappManager.prisma = {
    message: {
      findFirst: async ({ where }) => {
        lookups.push(where);
        return lookups.length === 2 ? legacyMessage : null;
      }
    }
  };

  const createdAt = new Date('2026-11-02T15:49:12.000Z');
  const found = await whatsappManager._findSyncedMessage(7, {
    id: { _serialized: 'wa-message-91' }
  }, 'received', '[Image]', createdAt);

  assert.equal(found, legacyMessage);
  assert.equal(lookups[0].wa_msg_id, 'wa-message-91');
  assert.equal(lookups[1].wa_msg_id, null);
  assert.equal(lookups[1].direction, 'received');
  assert.equal(lookups[1].content, '[Image]');
  assert.equal(lookups[1].created_at.gte.getTime(), createdAt.getTime() - 120000);
});

test('backfills missing image and audio files when their conversation is opened', async (t) => {
  const originalPrisma = whatsappManager.prisma;
  const originalGetClient = whatsappManager.getClient;
  const originalPersist = whatsappManager._persistWhatsAppMedia;
  const updates = [];
  t.after(() => {
    whatsappManager.prisma = originalPrisma;
    whatsappManager.getClient = originalGetClient;
    whatsappManager._persistWhatsAppMedia = originalPersist;
  });

  const recentMessages = [
    { id: { _serialized: 'wa-image' }, type: 'image', body: '', hasMedia: true, fromMe: false, timestamp: 1_798_000_000 },
    { id: { _serialized: 'wa-audio' }, type: 'ptt', body: '', hasMedia: true, fromMe: false, timestamp: 1_798_000_010 },
    { id: { _serialized: 'wa-sent-image' }, type: 'image', body: '', hasMedia: true, fromMe: true, timestamp: 1_798_000_020 },
    ...Array.from({ length: 75 }, (_, index) => ({
      id: { _serialized: `wa-text-${index}` },
      type: 'chat',
      body: `message ${index}`,
      hasMedia: false,
      fromMe: false,
      timestamp: 1_798_001_000 + index * 60
    }))
  ];
  const requestedLimits = [];
  whatsappManager.getClient = (profileId) => {
    assert.equal(profileId, 7);
    return { getChatById: async waId => {
      assert.equal(waId, '15551234567@c.us');
      return {
        fetchMessages: async ({ limit }) => {
          requestedLimits.push(limit);
          return recentMessages.slice(-limit);
        }
      };
    } };
  };
  whatsappManager._persistWhatsAppMedia = async message => ({
    media_path: `${message.type}.media`,
    media_filename: `${message.type}.file`,
    media_mime: message.type === 'image' ? 'image/jpeg' : 'audio/ogg'
  });
  whatsappManager.prisma = {
    message: {
      findMany: async ({ where, orderBy }) => {
        assert.deepEqual(where.direction, { in: ['received', 'sent'] });
        assert.deepEqual(orderBy, { created_at: 'asc' });
        return [
          { id: 1, wa_msg_id: 'wa-image', type: 'image', direction: 'received', created_at: new Date(1_798_000_000 * 1000) },
          { id: 2, wa_msg_id: 'wa-audio', type: 'ptt', direction: 'received', created_at: new Date(1_798_000_010 * 1000) },
          { id: 3, wa_msg_id: 'wa-sent-image', type: 'image', direction: 'sent', created_at: new Date(1_798_000_020 * 1000) }
        ];
      },
      findFirst: async ({ where }) => {
        const index = recentMessages.findIndex(message => message.id._serialized === where.wa_msg_id);
        return index < 0 ? null : { id: index + 1, media_path: null };
      },
      update: async args => updates.push(args)
    }
  };

  const saved = await whatsappManager.backfillConversationMedia(7, {
    id: 13,
    wa_id: '15551234567@c.us'
  });

  assert.equal(saved, 3);
  assert.deepEqual(requestedLimits, [50, 100]);
  assert.equal(updates.length, 3);
  assert.equal(updates[0].where.id, 1);
  assert.equal(updates[0].data.media_path, 'image.media');
  assert.equal(updates[1].where.id, 2);
  assert.equal(updates[1].data.media_path, 'ptt.media');
  assert.equal(updates[2].where.id, 3);
  assert.equal(updates[2].data.media_path, 'image.media');
});

test('recovers group chat listings when whatsapp-web.js cannot serialize all chats', async (t) => {
  const originalPrisma = whatsappManager.prisma;
  const originalIO = whatsappManager.io;
  const originalIsSyncActive = whatsappManager._isSyncActive;
  const originalResolveName = whatsappManager._resolveChatContactName;
  const previousWindow = global.window;
  const upsertedContacts = [];
  const rawGroup = {
    id: { _serialized: '23456-78901@g.us' },
    name: 'Group from local chat collection',
    serialize: () => ({ id: { _serialized: '23456-78901@g.us' } })
  };
  const client = {
    getChats: async () => { throw new Error('chat serialization failed'); },
    pupPage: {
      evaluate: async (callback) => {
        global.window = {
          require: () => ({ Chat: { getModelsArray: () => [rawGroup] } })
        };
        try {
          return await callback();
        } finally {
          if (previousWindow === undefined) delete global.window;
          else global.window = previousWindow;
        }
      }
    }
  };

  t.after(() => {
    whatsappManager.prisma = originalPrisma;
    whatsappManager.io = originalIO;
    whatsappManager._isSyncActive = originalIsSyncActive;
    whatsappManager._resolveChatContactName = originalResolveName;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });

  whatsappManager._isSyncActive = () => true;
  whatsappManager._resolveChatContactName = async () => 'Group from local chat collection';
  whatsappManager.prisma = {
    contact: {
      upsert: async (args) => {
        upsertedContacts.push(args);
        return { id: 46 };
      }
    }
  };
  whatsappManager.io = null;

  await whatsappManager._syncGroupConversations(client, 7, 12, {}, false);

  assert.equal(upsertedContacts.length, 1);
  assert.equal(upsertedContacts[0].where.profile_id_phone_number.phone_number, 'group_23456-78901');
  assert.equal(upsertedContacts[0].create.name, 'Group from local chat collection');
});

test('preserves a stored WhatsApp ID when a text campaign already resolves that contact', async () => {
  const resolvedId = await whatsappManager.resolveRecipientId({
    getNumberId: async () => { throw new Error('Stored WhatsApp IDs should be reused'); }
  }, '15551234567@c.us', '+15557654321');

  assert.equal(resolvedId, '15551234567@c.us');
});

test('campaign documents keep their caption on the direct WhatsApp client transport', async (t) => {
  const originalLookup = whatsappManager._getEntryByProfileId;
  const originalResolve = whatsappManager.resolveRecipientId;
  const originalTrackSent = whatsappManager.trackBotSentId;
  const originalReportActivity = centralSync.reportActivity;
  const calls = [];
  const recipient = 'caption-dedupe-test@c.us';
  const requestedRecipient = 'caption-dedupe-test@lid';
  const signature = 'media:document:Campaign document caption';
  const client = {
    getChatById: async () => {
      throw new Error('The loaded chat transport should not be used');
    },
    sendMessage: async (...args) => {
      calls.push(args);
      return { id: { _serialized: 'message-id' } };
    }
  };

  t.after(() => {
    whatsappManager._getEntryByProfileId = originalLookup;
    whatsappManager.resolveRecipientId = originalResolve;
    whatsappManager.trackBotSentId = originalTrackSent;
    centralSync.reportActivity = originalReportActivity;
    for (const pendingRecipient of [recipient, requestedRecipient]) {
      const pending = whatsappManager._pendingBotMessages.get(`${pendingRecipient}\u0000${signature}`) || [];
      pending.forEach(message => whatsappManager._removePendingBotMessage(message));
    }
  });

  whatsappManager._getEntryByProfileId = () => ({
    entry: { status: 'connected', client, accountId: 12 }
  });
  whatsappManager.resolveRecipientId = async () => recipient;
  whatsappManager.trackBotSentId = () => {};
  centralSync.reportActivity = async () => true;

  const media = { mimetype: 'application/pdf', data: 'cGRm', filename: 'campaign.pdf' };
  const options = { caption: 'Campaign document caption', sendMediaAsDocument: true };
  const result = await whatsappManager.sendMedia(
    7,
    requestedRecipient,
    media,
    options,
    null,
    { direct: true }
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    recipient,
    media,
    { ...options, waitUntilMsgSent: true }
  ]);
  assert.equal(result.recipient, recipient);
  assert.equal(result.sent.id._serialized, 'message-id');
  assert.equal(whatsappManager._consumePendingBotMessage(requestedRecipient, signature), true);
});

test('campaign media removes the invalid WhatsApp model id before sending', async (t) => {
  const originalLookup = whatsappManager._getEntryByProfileId;
  const originalResolve = whatsappManager.resolveRecipientId;
  const originalTrack = whatsappManager._trackPendingBotMessage;
  const originalRemove = whatsappManager._removePendingBotMessage;
  const originalTrackSent = whatsappManager.trackBotSentId;
  const originalReportActivity = centralSync.reportActivity;
  const calls = [];
  let sendError = null;
  let patchResult;
  let removedPendingMessages = 0;
  let evaluateCalls = 0;
  let recoveredArguments;
  const trackedIds = [];
  const mediaData = {
    __x_id: undefined,
    filehash: 'media-hash',
    toJSON() {
      return { __x_id: undefined, filehash: 'media-hash', caption: undefined };
    }
  };
  const runtime = {
    processMediaData: async () => mediaData
  };
  const client = {
    pupPage: {
      evaluate: async (callback, ...args) => {
        evaluateCalls++;
        if (evaluateCalls === 2) {
          recoveredArguments = args;
          return { messageId: 'recovered-message-id', ack: 2 };
        }
        if (evaluateCalls === 5) return null;
        const previousWindow = global.window;
        global.window = { WWebJS: runtime };
        try {
          const installed = await callback();
          const processed = await runtime.processMediaData();
          processed.caption = 'Campaign caption';
          const json = processed.toJSON();
          patchResult = {
            installed,
            internalIdEnumerable: Object.prototype.propertyIsEnumerable.call(processed, '__x_id'),
            serializedIdPresent: Object.prototype.hasOwnProperty.call(json, '__x_id'),
            serializedCaption: json.caption
          };
          return installed;
        } finally {
          if (previousWindow === undefined) delete global.window;
          else global.window = previousWindow;
        }
      }
    },
    sendMessage: async (...args) => {
      calls.push(args);
      if (sendError) throw new Error(sendError);
      return undefined;
    }
  };

  t.after(() => {
    whatsappManager._getEntryByProfileId = originalLookup;
    whatsappManager.resolveRecipientId = originalResolve;
    whatsappManager._trackPendingBotMessage = originalTrack;
    whatsappManager._removePendingBotMessage = originalRemove;
    whatsappManager.trackBotSentId = originalTrackSent;
    centralSync.reportActivity = originalReportActivity;
  });

  whatsappManager._getEntryByProfileId = () => ({
    entry: { status: 'connected', client, accountId: 12 }
  });
  whatsappManager.resolveRecipientId = async (_client, recipient) => recipient;
  whatsappManager._trackPendingBotMessage = () => ({});
  whatsappManager._removePendingBotMessage = () => { removedPendingMessages++; };
  whatsappManager.trackBotSentId = (id) => { trackedIds.push(id); };
  centralSync.reportActivity = async () => true;

  const media = { mimetype: 'image/jpeg', data: 'aW1hZ2U=', filename: 'test.jpg' };
  const options = { caption: 'Campaign caption' };
  const result = await whatsappManager.sendMedia(
    7,
    '123456789@c.us',
    media,
    options,
    null,
    { direct: true }
  );

  assert.deepEqual(calls[0], [
    '123456789@c.us',
    media,
    { ...options, waitUntilMsgSent: true }
  ]);
  assert.deepEqual(patchResult, {
    installed: true,
    internalIdEnumerable: false,
    serializedIdPresent: false,
    serializedCaption: 'Campaign caption'
  });
  assert.equal(result.sent.id._serialized, 'recovered-message-id');
  assert.equal(result.sent.ack, 2);
  assert.equal(recoveredArguments[0], '123456789@c.us');
  assert.equal(recoveredArguments[2], 'image');
  assert.equal(recoveredArguments[3], options.caption);
  assert.deepEqual(trackedIds, ['recovered-message-id']);

  sendError = 'send failed';
  await assert.rejects(
    whatsappManager.sendMedia(7, '123456789@c.us', media, {}, null, { direct: true }),
    /send failed/
  );

  sendError = null;
  await assert.rejects(
    whatsappManager.sendMedia(7, '123456789@c.us', media, {}, null, { direct: true }),
    /n'a pas confirmé/
  );
  assert.equal(calls.length, 3);
  assert.equal(removedPendingMessages, 2);
});

test('destroying a client waits for Chrome to close before removing its session entry', async (t) => {
  const originalClients = whatsappManager.clients;
  const clients = new Map();
  whatsappManager.clients = clients;
  t.after(() => {
    whatsappManager.clients = originalClients;
  });

  let markStarted;
  let finishDestroy;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const destroyGate = new Promise((resolve) => { finishDestroy = resolve; });
  const entry = {
    client: {
      destroy: async () => {
        markStarted();
        await destroyGate;
      }
    }
  };
  clients.set(1, entry);

  const destroyPromise = whatsappManager._destroyEntry(1);
  await started;
  assert.equal(clients.get(1), entry);

  finishDestroy();
  await destroyPromise;
  assert.equal(clients.has(1), false);
});

test('a failed Chrome shutdown keeps the session entry available for a safe retry', async (t) => {
  const originalClients = whatsappManager.clients;
  const clients = new Map();
  whatsappManager.clients = clients;
  t.after(() => {
    whatsappManager.clients = originalClients;
  });

  const entry = {
    client: {
      destroy: async () => { throw new Error('browser still running'); }
    }
  };
  clients.set(2, entry);

  await assert.rejects(whatsappManager._destroyEntry(2), /browser still running/);
  assert.equal(clients.get(2), entry);

  entry.client.destroy = async () => {};
  await whatsappManager._destroyEntry(2);
  assert.equal(clients.has(2), false);
});
