'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const ffmpegPath = require('ffmpeg-static');
const { UPLOADS_DIR } = require('../services/mediaStorage');

test('serves Ogg voice notes as MP3 for browser playback while keeping the archive unchanged', async (t) => {
  const prismaPath = require.resolve('../prisma');
  const authPath = require.resolve('../middleware/auth');
  const managerPath = require.resolve('../services/whatsappManager');
  const routePath = require.resolve('./messageRoutes');
  const previousModules = new Map(
    [prismaPath, authPath, managerPath, routePath].map(modulePath => [modulePath, require.cache[modulePath]])
  );
  const archiveFilename = `playback-test-${process.pid}-${Date.now()}.ogg`;
  const archivePath = path.join(UPLOADS_DIR, archiveFilename);
  execFileSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=mono:sample_rate=48000',
    '-t', '0.3',
    '-codec:a', 'libopus',
    '-f', 'ogg',
    archivePath
  ], { windowsHide: true });
  const prisma = { message: { findFirst: async () => null } };

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
    exports: { getClient: () => null }
  };
  delete require.cache[routePath];

  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { fs.unlinkSync(archivePath); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const [modulePath, previousModule] of previousModules) {
      if (previousModule) require.cache[modulePath] = previousModule;
      else delete require.cache[modulePath];
    }
  });

  const app = express();
  app.use('/messages', require('./messageRoutes'));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages/media/${archiveFilename}?playback=mp3`);
  const audio = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /audio\/mpeg/);
  assert.equal(audio.subarray(0, 3).toString(), 'ID3');
  assert.equal(fs.existsSync(archivePath), true);
});
