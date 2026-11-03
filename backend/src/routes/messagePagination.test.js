'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

test('returns the newest conversation page in chronological order', async (t) => {
  const prismaPath = require.resolve('../prisma');
  const authPath = require.resolve('../middleware/auth');
  const managerPath = require.resolve('../services/whatsappManager');
  const routePath = require.resolve('./messageRoutes');
  const previousModules = new Map(
    [prismaPath, authPath, managerPath, routePath].map(modulePath => [modulePath, require.cache[modulePath]])
  );
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    contact_id: 7,
    content: `message-${index + 1}`,
    created_at: new Date(Date.UTC(2026, 10, 2, 10, index))
  }));
  let query;
  const prisma = {
    contact: { findFirst: async () => ({ id: 7, wa_id: '15551234567@c.us' }) },
    message: {
      findMany: async args => {
        query = args;
        return [...rows]
          .sort((left, right) => right.created_at - left.created_at || right.id - left.id)
          .slice(args.skip, args.skip + args.take);
      },
      count: async () => rows.length
    }
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
    exports: { backfillConversationMedia: async () => 0 }
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
  app.use('/messages', require('./messageRoutes'));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages/conversation/7?limit=3&page=1`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.messages.map(message => message.id), [8, 9, 10]);
  assert.deepEqual(query.orderBy, [{ created_at: 'desc' }, { id: 'desc' }]);
  assert.equal(query.skip, 0);
  assert.equal(query.take, 3);
  assert.equal(body.pagination.hasMore, true);
});
