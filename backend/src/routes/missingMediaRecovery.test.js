'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const mediaStorage = require('../services/mediaStorage');

test('restores a voice message when its archived file is missing from uploads', async (t) => {
  const prismaPath = require.resolve('../prisma');
  const authPath = require.resolve('../middleware/auth');
  const managerPath = require.resolve('../services/whatsappManager');
  const mediaStoragePath = require.resolve('../services/mediaStorage');
  const routePath = require.resolve('./messageRoutes');
  const previousModules = new Map(
    [prismaPath, authPath, managerPath, mediaStoragePath, routePath]
      .map(modulePath => [modulePath, require.cache[modulePath]])
  );
  const staleFilename = `missing-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.ogg`;
  const message = {
    id: 82,
    wa_msg_id: 'false_15551234567@c.us_voice-message',
    media_path: staleFilename,
    media_filename: 'Message vocal',
    media_mime: 'audio/ogg',
    type: 'ptt',
    direction: 'received',
    created_at: new Date('2026-11-03T07:31:00.000Z'),
    contact: { wa_id: '15551234567@c.us', profile_id: 7 }
  };
  const updatedMessages = [];
  const updatedMedia = {
    media_path: 'restored-voice.ogg',
    media_filename: 'Message vocal',
    media_mime: 'audio/ogg'
  };
  const waMessage = {
    id: { _serialized: message.wa_msg_id },
    hasMedia: true,
    type: 'ptt'
  };
  let requestedMessageId = null;
  const prisma = {
    message: {
      findFirst: async args => args.where.media_path === staleFilename ? message : null,
      update: async args => updatedMessages.push(args)
    }
  };
  const client = {
    getMessageById: async id => {
      requestedMessageId = id;
      return waMessage;
    }
  };

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      authMiddleware: (req, _res, next) => next(),
      profileMiddleware: (req, _res, next) => { req.profileId = 7; next(); }
    }
  };
  require.cache[managerPath] = {
    id: managerPath,
    filename: managerPath,
    loaded: true,
    exports: { getClient: profileId => profileId === 7 ? client : null }
  };
  require.cache[mediaStoragePath] = {
    id: mediaStoragePath,
    filename: mediaStoragePath,
    loaded: true,
    exports: {
      ...mediaStorage,
      persistWhatsAppMedia: async receivedMessage => {
        assert.equal(receivedMessage, waMessage);
        return updatedMedia;
      }
    }
  };
  delete require.cache[routePath];

  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const [modulePath, previousModule] of previousModules) {
      if (previousModule) require.cache[modulePath] = previousModule;
      else delete require.cache[modulePath];
    }
  });

  const app = express();
  app.use((req, res, next) => {
    res.sendFile = filePath => res.status(200).json({ file: path.basename(filePath) });
    next();
  });
  app.use('/messages', require('./messageRoutes'));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages/media/${staleFilename}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { file: updatedMedia.media_path });
  assert.equal(requestedMessageId, message.wa_msg_id);
  assert.equal(updatedMessages.length, 1);
  assert.equal(updatedMessages[0].where.id, message.id);
  assert.equal(updatedMessages[0].data.media_path, updatedMedia.media_path);
});
