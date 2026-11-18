'use strict';

/**
 * setup-db.js — Synchronisation SQLite sans Prisma CLI
 * Crée toutes les tables si elles n'existent pas,
 * et ajoute les colonnes manquantes pour les mises à jour (idempotent).
 *
 * Requiert Node.js 22.5+ (module node:sqlite expérimental).
 */

// ── Vérification version Node.js ──────────────────────────────────────────
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error('');
  console.error('[DB] ERREUR : Node.js 22.5 ou superieur est requis.');
  console.error('[DB] Version detectee : ' + process.version);
  console.error('[DB] Telechargez Node.js 22 LTS : https://nodejs.org/en/download');
  console.error('');
  process.exit(1);
}

const path = require('node:path');
const fs   = require('node:fs');
const { resolveSqliteDatabasePath } = require('./src/utils/sqliteDatabasePath');

// ── Charger .env manuellement ─────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  }
}

// ── Résoudre le chemin SQLite depuis DATABASE_URL ─────────────────────────
const rawUrl = process.env.DATABASE_URL || 'file:./dev.db';
let dbPath;
try {
  dbPath = resolveSqliteDatabasePath(rawUrl, path.join(__dirname, 'prisma', 'schema.prisma'));
  if (!dbPath) throw new Error('DATABASE_URL doit pointer vers une base SQLite persistante.');
} catch (err) {
  console.error('[DB] DATABASE_URL invalide :', err.message);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// ── Ouvrir la base SQLite ─────────────────────────────────────────────────
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(dbPath);
} catch (err) {
  console.error('[DB] Erreur ouverture SQLite :', err.message);
  process.exit(1);
}

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = OFF;');

// ── Créer toutes les tables (idempotent) ──────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS "Account" (
  "id"                 INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "email"              TEXT     NOT NULL UNIQUE,
  "password"           TEXT     NOT NULL,
  "name"               TEXT     NOT NULL,
  "role"               TEXT     NOT NULL DEFAULT 'user',
  "created_at"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reset_token"        TEXT,
  "reset_token_expiry" DATETIME,
  "credit_balance"     REAL     NOT NULL DEFAULT 0,
  "is_blocked"         INTEGER NOT NULL DEFAULT 0,
  "language"           TEXT    NOT NULL DEFAULT 'fr',
  "central_ai_token"   TEXT
);

CREATE TABLE IF NOT EXISTS "WhatsAppProfile" (
  "id"           INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id"   INTEGER  NOT NULL,
  "phone_number" TEXT     NOT NULL,
  "display_name" TEXT,
  "is_connected" INTEGER  NOT NULL DEFAULT 0,
  "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id"),
  UNIQUE ("account_id", "phone_number")
);

CREATE TABLE IF NOT EXISTS "BotConfig" (
  "id"                     INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id"             INTEGER NOT NULL UNIQUE,
  "bot_name"               TEXT    NOT NULL DEFAULT 'Botora',
  "bot_info"               TEXT    NOT NULL DEFAULT '',
  "bot_behavior"           TEXT    NOT NULL DEFAULT '',
  "ia_enabled"             INTEGER NOT NULL DEFAULT 0,
  "response_delay_seconds" INTEGER NOT NULL DEFAULT 120,
  "business_hours_enabled" INTEGER NOT NULL DEFAULT 0,
  "open_days"              TEXT    NOT NULL DEFAULT '1,2,3,4,5',
  "open_time"              TEXT    NOT NULL DEFAULT '09:00',
  "close_time"             TEXT    NOT NULL DEFAULT '18:00',
  "timezone"               TEXT    NOT NULL DEFAULT 'UTC',
  "away_message"           TEXT    NOT NULL DEFAULT '',
  "away_once_per_session"  INTEGER NOT NULL DEFAULT 1,
  "personality"            TEXT    NOT NULL DEFAULT 'professional',
  "system_prompt_override" TEXT,
  "sentiment_alert"        INTEGER NOT NULL DEFAULT 0,
  "media_auto_reply"       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  "id"             INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id"     INTEGER  NOT NULL,
  "file_name"      TEXT     NOT NULL,
  "category"       TEXT     NOT NULL,
  "mime_type"      TEXT     NOT NULL,
  "file_size"      INTEGER  NOT NULL,
  "extracted_text" TEXT     NOT NULL,
  "status"         TEXT     NOT NULL DEFAULT 'pending',
  "validated_at"   DATETIME,
  "created_at"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     DATETIME NOT NULL,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_profile_id_status_idx"
  ON "KnowledgeDocument"("profile_id", "status");

CREATE TABLE IF NOT EXISTS "Contact" (
  "id"               INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id"       INTEGER  NOT NULL,
  "phone_number"     TEXT     NOT NULL,
  "wa_id"            TEXT,
  "name"             TEXT,
  "created_at"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ia_paused"        INTEGER  NOT NULL DEFAULT 0,
  "sensitive_flagged" INTEGER NOT NULL DEFAULT 0,
  "archived"         INTEGER  NOT NULL DEFAULT 0,
  "notes"            TEXT,
  "funnel_stage"     TEXT     NOT NULL DEFAULT 'prospect',
  "unread_count"     INTEGER  NOT NULL DEFAULT 0,
  "is_favorite"      INTEGER  NOT NULL DEFAULT 0,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id"),
  UNIQUE ("profile_id", "phone_number")
);

CREATE TABLE IF NOT EXISTS "ContactMemory" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "contact_id" INTEGER  NOT NULL UNIQUE,
  "summary"    TEXT     NOT NULL,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Tag" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id" INTEGER  NOT NULL,
  "name"       TEXT     NOT NULL,
  "color"      TEXT     NOT NULL DEFAULT '#25d366',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE,
  UNIQUE ("profile_id", "name")
);

CREATE TABLE IF NOT EXISTS "ContactTag" (
  "contact_id" INTEGER NOT NULL,
  "tag_id"     INTEGER NOT NULL,
  PRIMARY KEY ("contact_id", "tag_id"),
  FOREIGN KEY ("contact_id") REFERENCES "Contact"("id") ON DELETE CASCADE,
  FOREIGN KEY ("tag_id")     REFERENCES "Tag"("id")     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Message" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "contact_id" INTEGER  NOT NULL,
  "content"    TEXT     NOT NULL,
  "direction"  TEXT     NOT NULL,
  "origin"     TEXT     NOT NULL DEFAULT 'unknown',
  "type"       TEXT     NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unread"     INTEGER  NOT NULL DEFAULT 1,
  "sentiment"  TEXT,
  "media_path" TEXT,
  FOREIGN KEY ("contact_id") REFERENCES "Contact"("id")
);

CREATE TABLE IF NOT EXISTS "FAQ" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id" INTEGER  NOT NULL,
  "question"   TEXT     NOT NULL,
  "answer"     TEXT     NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id")
);

CREATE TABLE IF NOT EXISTS "QuickReply" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id" INTEGER  NOT NULL,
  "title"      TEXT     NOT NULL,
  "content"    TEXT     NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id"                INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id"        INTEGER  NOT NULL,
  "name"              TEXT     NOT NULL,
  "status"            TEXT     NOT NULL DEFAULT 'draft',
  "created_at"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduled_at"      DATETIME,
  "started_at"        DATETIME,
  "completed_at"      DATETIME,
  "delay_min_seconds" INTEGER  NOT NULL DEFAULT 20,
  "delay_max_seconds" INTEGER  NOT NULL DEFAULT 60,
  "tag_id"            INTEGER,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id"),
  FOREIGN KEY ("tag_id")     REFERENCES "Tag"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "CampaignMessage" (
  "id"                  INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "campaign_id"         INTEGER NOT NULL,
  "content"             TEXT    NOT NULL,
  "order_index"         INTEGER NOT NULL DEFAULT 0,
  "delay_after_seconds" INTEGER NOT NULL DEFAULT 0,
  "media_url"           TEXT,
  "media_type"          TEXT,
  FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "CampaignTarget" (
  "id"          INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "campaign_id" INTEGER  NOT NULL,
  "contact_id"  INTEGER  NOT NULL,
  "status"      TEXT     NOT NULL DEFAULT 'pending',
  "sent_at"     DATETIME,
  "error"       TEXT,
  FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE CASCADE,
  FOREIGN KEY ("contact_id")  REFERENCES "Contact"("id")  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "VerificationTrigger" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id" INTEGER  NOT NULL,
  "text"       TEXT     NOT NULL,
  "is_active"  INTEGER  NOT NULL DEFAULT 1,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "SensitiveKeyword" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id" INTEGER  NOT NULL,
  "keyword"    TEXT     NOT NULL,
  "is_active"  INTEGER  NOT NULL DEFAULT 1,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "SensitiveFlag" (
  "id"              INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id"      INTEGER  NOT NULL,
  "contact_id"      INTEGER  NOT NULL,
  "keyword_matched" TEXT     NOT NULL,
  "message_content" TEXT     NOT NULL,
  "flagged_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE,
  FOREIGN KEY ("contact_id")  REFERENCES "Contact"("id")         ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Status" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id" INTEGER  NOT NULL,
  "content"    TEXT     NOT NULL,
  "type"       TEXT     NOT NULL DEFAULT 'text',
  "wa_msg_id"  TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PlatformConfig" (
  "key"   TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "CreditTransaction" (
  "id"          INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id"  INTEGER  NOT NULL,
  "amount"      REAL     NOT NULL,
  "type"        TEXT     NOT NULL,
  "description" TEXT,
  "tokens_used" INTEGER,
  "created_at"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "KeywordAutoReply" (
  "id"                 INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "central_id"         INTEGER UNIQUE,
  "profile_id"         INTEGER  NOT NULL,
  "keyword"            TEXT     NOT NULL,
  "keyword_normalized" TEXT     NOT NULL,
  "response_text"      TEXT     NOT NULL,
  "is_active"          INTEGER  NOT NULL DEFAULT 1,
  "central_updated_at" DATETIME,
  "created_at"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE,
  UNIQUE ("profile_id", "keyword_normalized")
);
CREATE INDEX IF NOT EXISTS "KeywordAutoReply_profile_id_is_active_idx"
  ON "KeywordAutoReply"("profile_id", "is_active");

CREATE TABLE IF NOT EXISTS "DressurQueueItem" (
  "id"         INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id" INTEGER  NOT NULL,
  "source_key" TEXT     NOT NULL,
  "numero"     TEXT     NOT NULL,
  "message"    TEXT     NOT NULL,
  "wa_id"      TEXT,
  "position"   INTEGER  NOT NULL DEFAULT 0,
  "status"     TEXT     NOT NULL DEFAULT 'pending',
  "error"      TEXT,
  "sent_at"    DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE,
  UNIQUE ("account_id", "source_key")
);
CREATE INDEX IF NOT EXISTS "DressurQueueItem_account_id_status_idx"
  ON "DressurQueueItem"("account_id", "status");

CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
  "id"              INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id"      INTEGER  NOT NULL,
  "provider"        TEXT     NOT NULL DEFAULT 'fedapay',
  "external_id"     TEXT     NOT NULL UNIQUE,
  "amount_xof"      INTEGER  NOT NULL,
  "credits"         REAL     NOT NULL,
  "status"          TEXT     NOT NULL DEFAULT 'pending',
  "description"     TEXT,
  "metadata"        TEXT,
  "approved_at"     DATETIME,
  "last_checked_at" DATETIME,
  "created_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PaymentTransaction_account_id_created_at_idx"
  ON "PaymentTransaction"("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_account_id_status_idx"
  ON "PaymentTransaction"("account_id", "status");

CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
  "id"          INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "payment_id"  INTEGER,
  "event_id"    TEXT     NOT NULL UNIQUE,
  "event_type"  TEXT     NOT NULL,
  "payload"     TEXT     NOT NULL,
  "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("payment_id") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_event_type_received_at_idx"
  ON "PaymentWebhookEvent"("event_type", "received_at");

CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
  "id"              INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id"      INTEGER  NOT NULL,
  "provider"        TEXT     NOT NULL DEFAULT 'fedapay',
  "external_id"     TEXT     NOT NULL UNIQUE,
  "amount_xof"      INTEGER  NOT NULL,
  "duration_days"   INTEGER  NOT NULL DEFAULT 365,
  "status"          TEXT     NOT NULL DEFAULT 'pending',
  "description"     TEXT,
  "metadata"        TEXT,
  "approved_at"     DATETIME,
  "last_checked_at" DATETIME,
  "created_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_account_id_created_at_idx"
  ON "SubscriptionPayment"("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_account_id_status_idx"
  ON "SubscriptionPayment"("account_id", "status");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id"           INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "key_uid"      TEXT     NOT NULL UNIQUE,
  "account_id"   INTEGER  NOT NULL,
  "name"         TEXT     NOT NULL,
  "prefix"       TEXT     NOT NULL,
  "key_hash"     TEXT     NOT NULL UNIQUE,
  "last_used_at" DATETIME,
  "revoked_at"   DATETIME,
  "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ApiKey_account_id_revoked_at_idx"
  ON "ApiKey"("account_id", "revoked_at");

CREATE TABLE IF NOT EXISTS "CreditUsage" (
  "id"               INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "central_id"       INTEGER UNIQUE,
  "account_id"       INTEGER  NOT NULL,
  "event_type"       TEXT     NOT NULL,
  "tokens_used"      INTEGER  NOT NULL,
  "credits_used"     REAL     NOT NULL,
  "tokens_per_unit"  INTEGER  NOT NULL DEFAULT 100000,
  "credits_per_unit" REAL     NOT NULL DEFAULT 1,
  "xof_per_unit"     REAL     NOT NULL DEFAULT 120,
  "metadata"         TEXT,
  "created_at"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreditUsage_account_id_created_at_idx"
  ON "CreditUsage"("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "CreditUsage_created_at_idx"
  ON "CreditUsage"("created_at");

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  "id"            INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name"          TEXT     NOT NULL,
  "slug"          TEXT     NOT NULL UNIQUE,
  "description"   TEXT,
  "price"         REAL     NOT NULL DEFAULT 0,
  "currency"      TEXT     NOT NULL DEFAULT 'XOF',
  "credits"       REAL     NOT NULL DEFAULT 0,
  "duration_days" INTEGER  NOT NULL DEFAULT 30,
  "max_profiles"  INTEGER  NOT NULL DEFAULT 1,
  "features"      TEXT,
  "is_active"     INTEGER  NOT NULL DEFAULT 1,
  "sort_order"    INTEGER  NOT NULL DEFAULT 0,
  "created_at"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SubscriptionPlan_is_active_sort_order_idx"
  ON "SubscriptionPlan"("is_active", "sort_order");
`);

// ── Migrations idempotentes ───────────────────────────────────────────────
const accountColumns = db.prepare('PRAGMA table_info("Account")').all();
if (!accountColumns.some(column => column.name === 'central_ai_token')) {
  db.exec('ALTER TABLE "Account" ADD COLUMN "central_ai_token" TEXT');
}

db.exec(`
UPDATE "BotConfig" SET "response_delay_seconds" = 120 WHERE "response_delay_seconds" = 15;
UPDATE "BotConfig" SET "response_delay_seconds" = 60
  WHERE "response_delay_seconds" < 60 AND "response_delay_seconds" <> 15;
`);

// ── Ajouter les colonnes manquantes (mises à jour silencieuses) ───────────
// SQLite ne supporte pas "ADD COLUMN IF NOT EXISTS" — on capture les erreurs
const migrations = [
  // Account
  'ALTER TABLE "Account" ADD COLUMN "credit_balance"          REAL    NOT NULL DEFAULT 0',
  'ALTER TABLE "Account" ADD COLUMN "is_blocked"              INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Account" ADD COLUMN "reset_token"             TEXT',
  'ALTER TABLE "Account" ADD COLUMN "reset_token_expiry"      DATETIME',
  'ALTER TABLE "Account" ADD COLUMN "language"                TEXT    NOT NULL DEFAULT \'fr\'',
  // BotConfig
  'ALTER TABLE "BotConfig" ADD COLUMN "business_hours_enabled"  INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "BotConfig" ADD COLUMN "open_days"               TEXT    NOT NULL DEFAULT \'1,2,3,4,5\'',
  'ALTER TABLE "BotConfig" ADD COLUMN "open_time"               TEXT    NOT NULL DEFAULT \'09:00\'',
  'ALTER TABLE "BotConfig" ADD COLUMN "close_time"              TEXT    NOT NULL DEFAULT \'18:00\'',
  'ALTER TABLE "BotConfig" ADD COLUMN "timezone"                TEXT    NOT NULL DEFAULT \'UTC\'',
  'ALTER TABLE "BotConfig" ADD COLUMN "away_message"            TEXT    NOT NULL DEFAULT \'\'',
  'ALTER TABLE "BotConfig" ADD COLUMN "away_once_per_session"   INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE "BotConfig" ADD COLUMN "personality"             TEXT    NOT NULL DEFAULT \'professional\'',
  'ALTER TABLE "BotConfig" ADD COLUMN "system_prompt_override"  TEXT',
  'ALTER TABLE "BotConfig" ADD COLUMN "sentiment_alert"         INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "BotConfig" ADD COLUMN "sentiment_enabled"       INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "BotConfig" ADD COLUMN "media_auto_reply"        INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "BotConfig" ADD COLUMN "ia_group_enabled"        INTEGER NOT NULL DEFAULT 0',
  // Contact
  'ALTER TABLE "Contact" ADD COLUMN "ia_paused"         INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Contact" ADD COLUMN "sensitive_flagged" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Contact" ADD COLUMN "wa_id"             TEXT',
  'ALTER TABLE "Contact" ADD COLUMN "archived"          INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Contact" ADD COLUMN "notes"             TEXT',
  'ALTER TABLE "Contact" ADD COLUMN "funnel_stage"      TEXT    NOT NULL DEFAULT \'prospect\'',
  'ALTER TABLE "Contact" ADD COLUMN "unread_count"      INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Contact" ADD COLUMN "is_favorite"       INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "Contact" ADD COLUMN "is_pinned"         INTEGER NOT NULL DEFAULT 0',
  // Message
  'ALTER TABLE "Message" ADD COLUMN "unread"     INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE "Message" ADD COLUMN "sentiment"  TEXT',
  'ALTER TABLE "Message" ADD COLUMN "media_path" TEXT',
  'ALTER TABLE "Message" ADD COLUMN "origin"     TEXT NOT NULL DEFAULT \'unknown\'',
  'ALTER TABLE "Message" ADD COLUMN "wa_msg_id"       TEXT',
  'ALTER TABLE "Message" ADD COLUMN "media_filename"  TEXT',
  'ALTER TABLE "Message" ADD COLUMN "media_mime"      TEXT',
  // Campaign
  'ALTER TABLE "Campaign" ADD COLUMN "tag_id"       INTEGER',
  'ALTER TABLE "Campaign" ADD COLUMN "scheduled_at" DATETIME',
  'ALTER TABLE "Campaign" ADD COLUMN "started_at"   DATETIME',
  'ALTER TABLE "Campaign" ADD COLUMN "completed_at" DATETIME',
  // CampaignMessage
  'ALTER TABLE "CampaignMessage" ADD COLUMN "media_url"  TEXT',
  'ALTER TABLE "CampaignMessage" ADD COLUMN "media_type" TEXT',
  'ALTER TABLE "CampaignMessage" ADD COLUMN "media_path" TEXT',
];

for (const stmt of migrations) {
  try {
    db.exec(stmt);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

db.exec('PRAGMA foreign_keys = ON;');
db.close();

console.log('[DB] Base de donnees synchronisee avec succes');
