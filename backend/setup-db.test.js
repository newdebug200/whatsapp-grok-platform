'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { Prisma, PrismaClient } = require('@prisma/client');

const setupScript = path.join(__dirname, 'setup-db.js');
const expectedTables = [
  'Account',
  'ApiKey',
  'BotConfig',
  'Campaign',
  'CampaignMessage',
  'CampaignTarget',
  'Contact',
  'ContactMemory',
  'ContactTag',
  'CreditTransaction',
  'CreditUsage',
  'DressurQueueItem',
  'FAQ',
  'KeywordAutoReply',
  'KnowledgeDocument',
  'Message',
  'PaymentTransaction',
  'PaymentWebhookEvent',
  'PlatformConfig',
  'QuickReply',
  'SensitiveFlag',
  'SensitiveKeyword',
  'Status',
  'SubscriptionPayment',
  'SubscriptionPlan',
  'Tag',
  'VerificationTrigger',
  'WhatsAppProfile'
];

test('upgrades a legacy Desktop database idempotently without losing account data', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'botora-setup-db-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const databasePath = path.join(directory, 'botora.sqlite');
  const legacyDb = new DatabaseSync(databasePath);
  legacyDb.exec(`
    CREATE TABLE "Account" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "email" TEXT NOT NULL UNIQUE,
      "password" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'user',
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO "Account" ("email", "password", "name")
    VALUES ('desktop-test@example.invalid', 'hash', 'Desktop test');
    CREATE TABLE "BotConfig" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "profile_id" INTEGER NOT NULL UNIQUE,
      "bot_name" TEXT NOT NULL DEFAULT 'Botora',
      "bot_info" TEXT NOT NULL DEFAULT '',
      "bot_behavior" TEXT NOT NULL DEFAULT '',
      "ia_enabled" INTEGER NOT NULL DEFAULT 0,
      "response_delay_seconds" INTEGER NOT NULL DEFAULT 120,
      "business_hours_enabled" INTEGER NOT NULL DEFAULT 0,
      "open_days" TEXT NOT NULL DEFAULT '1,2,3,4,5',
      "open_time" TEXT NOT NULL DEFAULT '09:00',
      "close_time" TEXT NOT NULL DEFAULT '18:00',
      "timezone" TEXT NOT NULL DEFAULT 'UTC',
      "away_message" TEXT NOT NULL DEFAULT '',
      "away_once_per_session" INTEGER NOT NULL DEFAULT 1,
      "personality" TEXT NOT NULL DEFAULT 'professional',
      "system_prompt_override" TEXT,
      "sentiment_alert" INTEGER NOT NULL DEFAULT 0,
      "media_auto_reply" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE "Contact" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "profile_id" INTEGER NOT NULL,
      "phone_number" TEXT NOT NULL,
      "wa_id" TEXT,
      "name" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ia_paused" INTEGER NOT NULL DEFAULT 0,
      "sensitive_flagged" INTEGER NOT NULL DEFAULT 0,
      "archived" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT,
      "funnel_stage" TEXT NOT NULL DEFAULT 'prospect',
      "unread_count" INTEGER NOT NULL DEFAULT 0,
      "is_favorite" INTEGER NOT NULL DEFAULT 0,
      UNIQUE ("profile_id", "phone_number")
    );
    CREATE TABLE "Message" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "contact_id" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "direction" TEXT NOT NULL,
      "origin" TEXT NOT NULL DEFAULT 'unknown',
      "type" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "unread" INTEGER NOT NULL DEFAULT 1,
      "sentiment" TEXT,
      "media_path" TEXT
    );
    CREATE TABLE "CampaignMessage" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "campaign_id" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "order_index" INTEGER NOT NULL DEFAULT 0,
      "delay_after_seconds" INTEGER NOT NULL DEFAULT 0,
      "media_url" TEXT,
      "media_type" TEXT
    );
  `);
  legacyDb.close();

  const env = {
    ...process.env,
    DATABASE_URL: pathToFileURL(databasePath).href,
    BOTORA_DATA_DIR: directory
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.execPath, [setupScript], {
      cwd: __dirname,
      env,
      encoding: 'utf8',
      timeout: 30000
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = new Set(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all().map(row => row.name));
    for (const table of expectedTables) assert.ok(tables.has(table), `missing table ${table}`);

    const account = db.prepare(
      'SELECT email, name FROM "Account" WHERE id = 1'
    ).get();
    assert.equal(account.email, 'desktop-test@example.invalid');
    assert.equal(account.name, 'Desktop test');

    const columns = table => new Set(
      db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name)
    );
    assert.ok(columns('BotConfig').has('sentiment_enabled'));
    assert.ok(columns('BotConfig').has('ia_group_enabled'));
    assert.ok(columns('Contact').has('is_pinned'));
    assert.ok(columns('Message').has('wa_msg_id'));
    assert.ok(columns('Message').has('media_filename'));
    assert.ok(columns('Message').has('media_mime'));
    assert.ok(columns('CampaignMessage').has('media_path'));
  } finally {
    db.close();
  }

  const databaseUrl = pathToFileURL(databasePath).href.replace(/^file:\/\/\//, 'file:');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = model.name[0].toLowerCase() + model.name.slice(1);
      const select = Object.fromEntries(
        model.fields
          .filter(field => field.kind === 'scalar')
          .map(field => [field.name, true])
      );
      await prisma[delegate].findMany({ select, take: 1 });
    }
  } finally {
    await prisma.$disconnect();
  }
});
