'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const whatsappManager = require('./whatsappManager');
const centralSync = require('./centralSync');

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
      return { __x_id: undefined, filehash: 'media-hash' };
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
          const json = processed.toJSON();
          patchResult = {
            installed,
            internalIdEnumerable: Object.prototype.propertyIsEnumerable.call(processed, '__x_id'),
            serializedIdPresent: Object.prototype.hasOwnProperty.call(json, '__x_id')
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
    serializedIdPresent: false
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
