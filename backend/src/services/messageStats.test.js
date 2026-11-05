'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { addMessageCount, createMessageCounts, SENT_MESSAGE_ORIGINS } = require('./messageStats');

test('message stats count sent messages by origin without mixing received messages', () => {
  const counts = createMessageCounts();
  const messages = [
    { direction: 'received', origin: 'whatsapp' },
    { direction: 'sent', origin: 'ai' },
    { direction: 'sent', origin: 'campaign' },
    { direction: 'sent', origin: 'manual' },
    { direction: 'sent', origin: 'automation' },
    { direction: 'sent', origin: 'whatsapp' },
    { direction: 'sent', origin: 'unknown' }
  ];

  messages.forEach(message => addMessageCount(counts, message));

  assert.equal(counts.received, 1);
  assert.equal(counts.sent, SENT_MESSAGE_ORIGINS.length);
  assert.equal(counts.ai, 1);
  assert.equal(counts.campaign, 1);
  assert.equal(counts.manual, 1);
  assert.equal(counts.automation, 1);
  assert.equal(counts.whatsapp, 1);
  assert.equal(counts.unknown, 1);
});

test('message stats classify missing or unsupported sent origins as unknown', () => {
  const counts = createMessageCounts();

  addMessageCount(counts, { direction: 'sent' });
  addMessageCount(counts, { direction: 'sent', origin: 'unexpected' });

  assert.equal(counts.sent, 2);
  assert.equal(counts.unknown, 2);
});

test('message origin migration leaves existing messages classified as unknown', () => {
  const db = new DatabaseSync(':memory:');

  try {
    db.exec('CREATE TABLE "Message" ("id" INTEGER PRIMARY KEY, "direction" TEXT NOT NULL)');
    db.exec('INSERT INTO "Message" ("id", "direction") VALUES (1, \'sent\')');

    const migrationPath = path.join(__dirname, '../../prisma/migrations/20261102140000_add_message_origin/migration.sql');
    db.exec(fs.readFileSync(migrationPath, 'utf8'));

    assert.equal(db.prepare('SELECT "origin" FROM "Message" WHERE "id" = 1').get().origin, 'unknown');
    db.exec('INSERT INTO "Message" ("id", "direction") VALUES (2, \'received\')');
    assert.equal(db.prepare('SELECT "origin" FROM "Message" WHERE "id" = 2').get().origin, 'unknown');
  } finally {
    db.close();
  }
});
