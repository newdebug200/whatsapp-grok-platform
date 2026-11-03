'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  deleteStoredMedia,
  ensureCapacity,
  findMatchingWhatsAppMediaMessage,
  getWhatsAppMessageId,
  persistWhatsAppMedia
} = require('./mediaStorage');

test('persists incoming media with safe metadata and an on-disk file', async (t) => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botora-media-'));
  t.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));
  const payload = Buffer.from('sticker-data');
  let capacityRequest;
  const message = {
    hasMedia: true,
    type: 'sticker',
    _data: { filename: '../sticker.webp', mimetype: 'image/webp' },
    downloadMedia: async () => ({
      data: payload.toString('base64'),
      filename: '../sticker.webp',
      mimetype: 'image/webp'
    })
  };

  const stored = await persistWhatsAppMedia(message, {}, {
    uploadsDir,
    ensureCapacityFn: async (_prisma, bytes) => { capacityRequest = bytes; }
  });

  assert.equal(capacityRequest, payload.length);
  assert.match(stored.media_path, /^received_\d+_[a-f0-9]+\.webp$/);
  assert.equal(stored.media_filename, '.._sticker.webp');
  assert.equal(stored.media_mime, 'image/webp');
  assert.deepEqual(fs.readFileSync(path.join(uploadsDir, stored.media_path)), payload);
  assert.equal(deleteStoredMedia(stored.media_path, uploadsDir), true);
  assert.equal(fs.existsSync(path.join(uploadsDir, stored.media_path)), false);
});

test('does not download view-once or disappearing media', async () => {
  let downloads = 0;
  const message = {
    hasMedia: true,
    downloadMedia: async () => { downloads += 1; return { data: 'ZmlsZQ==', mimetype: 'image/jpeg' }; }
  };
  const ensureCapacityFn = async () => { throw new Error('must not reserve storage'); };

  assert.equal(await persistWhatsAppMedia({ ...message, isViewOnce: true }, {}, { ensureCapacityFn }), null);
  assert.equal(await persistWhatsAppMedia({ ...message, _data: { isViewOnceV2: true } }, {}, { ensureCapacityFn }), null);
  assert.equal(await persistWhatsAppMedia({ ...message, isEphemeral: true }, {}, { ensureCapacityFn }), null);
  assert.equal(downloads, 0);
});

test('retries transient media download failures before persisting', async (t) => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botora-media-retry-'));
  t.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));
  let attempts = 0;
  const message = {
    hasMedia: true,
    type: 'ptt',
    downloadMedia: async () => {
      attempts += 1;
      return attempts < 3 ? undefined : { data: Buffer.from('audio').toString('base64'), mimetype: 'audio/ogg' };
    }
  };

  const stored = await persistWhatsAppMedia(message, {}, {
    uploadsDir,
    ensureCapacityFn: async () => {},
    delayFn: async () => {}
  });

  assert.equal(attempts, 3);
  assert.equal(fs.readFileSync(path.join(uploadsDir, stored.media_path)).toString(), 'audio');
});

test('extracts serialized WhatsApp IDs and finds a recent media message by type and timestamp', () => {
  const createdAt = new Date('2026-11-02T16:18:14.000Z');
  const expected = {
    id: { _serialized: 'false_22962273861@c.us_ABCD' },
    type: 'ptt',
    timestamp: createdAt.getTime() / 1000,
    hasMedia: true,
    fromMe: false
  };

  assert.equal(getWhatsAppMessageId(expected), 'false_22962273861@c.us_ABCD');
  assert.equal(getWhatsAppMessageId({ id: 'wa-message-id' }), 'wa-message-id');
  assert.equal(findMatchingWhatsAppMediaMessage([
    { ...expected, type: 'image' },
    { ...expected, timestamp: expected.timestamp + 300 },
    expected,
    { ...expected, fromMe: true }
  ], { type: 'ptt', createdAt }), expected);
  assert.equal(findMatchingWhatsAppMediaMessage([
    expected,
    { ...expected, fromMe: true }
  ], { type: 'ptt', createdAt, fromMe: true }).fromMe, true);
});

test('rejects attempts to delete a media path outside the uploads directory', () => {
  assert.throws(() => deleteStoredMedia('..\\outside.txt', os.tmpdir()), /invalide/);
});

test('preserves archived files and reports insufficient disk space without deleting media', async (t) => {
  const originalStatfs = fs.statfsSync;
  const prismaCalls = [];
  t.after(() => { fs.statfsSync = originalStatfs; });
  fs.statfsSync = () => ({ blocks: 100, bsize: 1, bfree: 5 });
  const prisma = {
    message: { findMany: async () => prismaCalls.push('read'), updateMany: async () => prismaCalls.push('message') },
    campaignMessage: { findMany: async () => prismaCalls.push('campaign'), updateMany: async () => prismaCalls.push('campaign-update') }
  };

  assert.deepEqual(await ensureCapacity(prisma, 5), { deleted: 0, bytes: 0 });
  await assert.rejects(ensureCapacity(prisma, 6), error => {
    assert.equal(error.code, 'ENOSPC');
    assert.equal(error.requiredBytes, 6);
    assert.equal(error.availableBytes, 5);
    return true;
  });
  assert.deepEqual(prismaCalls, []);
});
