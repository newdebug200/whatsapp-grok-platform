'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const mediaStorage = require('../services/mediaStorage');

test('recovers older sent media from WhatsApp history and persists its local path', async (t) => {
  const prismaPath = require.resolve('../prisma');
  const authPath = require.resolve('../middleware/auth');
  const managerPath = require.resolve('../services/whatsappManager');
  const routePath = require.resolve('./messageRoutes');
  const previousModules = new Map(
    [prismaPath, authPath, managerPath, routePath].map(modulePath => [modulePath, require.cache[modulePath]])
  );
  const createdAt = new Date('2026-11-02T10:05:17.000Z');
  const message = {
    id: 47,
    wa_msg_id: null,
    media_path: null,
    media_filename: null,
    media_mime: 'image/jpeg',
    type: 'image',
    direction: 'sent',
    created_at: createdAt,
    contact: { wa_id: '15551234567@c.us' }
  };
  const updatedMessages = [];
  const requestedLimits = [];
  const storedMedia = {
    media_path: 'test-media.jpg',
    media_filename: 'test.jpg',
    media_mime: 'image/jpeg'
  };
  const remoteMessages = Array.from({ length: 100 }, (_, index) => ({
    id: { _serialized: `wa-message-${index}` },
    type: 'chat',
    timestamp: createdAt.getTime() / 1000 + index * 60,
    fromMe: true,
    hasMedia: false
  }));
  remoteMessages[0] = {
    ...remoteMessages[0],
    type: 'image',
    hasMedia: true,
    downloadMedia: async () => ({ data: Buffer.from('image').toString('base64'), mimetype: 'image/jpeg' })
  };

  const prisma = {
    message: {
      findFirst: async () => message,
      update: async args => updatedMessages.push(args)
    }
  };
  const client = {
    getMessageById: async () => null,
    getChatById: async () => ({
      fetchMessages: async ({ limit }) => {
        requestedLimits.push(limit);
        return remoteMessages.slice(-limit);
      }
    })
  };

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      authMiddleware: (req, _res, next) => next(),
      profileMiddleware: (req, _res, next) => { req.profileId = 1; next(); }
    }
  };
  require.cache[managerPath] = {
    id: managerPath,
    filename: managerPath,
    loaded: true,
    exports: { getClient: () => client }
  };
  require.cache[require.resolve('../services/mediaStorage')] = {
    id: require.resolve('../services/mediaStorage'),
    filename: require.resolve('../services/mediaStorage'),
    loaded: true,
    exports: {
      ...mediaStorage,
      persistWhatsAppMedia: async () => storedMedia
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
    require.cache[require.resolve('../services/mediaStorage')] = {
      id: require.resolve('../services/mediaStorage'),
      filename: require.resolve('../services/mediaStorage'),
      loaded: true,
      exports: mediaStorage
    };
  });

  const app = express();
  app.use((req, res, next) => {
    res.sendFile = filePath => res.status(200).json({ file: path.basename(filePath) });
    next();
  });
  app.use('/messages', require('./messageRoutes'));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages/media/message/47`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { file: storedMedia.media_path });
  assert.deepEqual(requestedLimits, [50, 100]);
  assert.equal(updatedMessages.length, 1);
  assert.equal(updatedMessages[0].where.id, message.id);
  assert.equal(updatedMessages[0].data.media_path, storedMedia.media_path);
});
