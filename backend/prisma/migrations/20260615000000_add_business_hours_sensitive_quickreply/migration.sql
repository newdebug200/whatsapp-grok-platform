-- AlterTable BotConfig: add business hours and away message columns
ALTER TABLE "BotConfig" ADD COLUMN "business_hours_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BotConfig" ADD COLUMN "open_days" TEXT NOT NULL DEFAULT '1,2,3,4,5';
ALTER TABLE "BotConfig" ADD COLUMN "open_time" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "BotConfig" ADD COLUMN "close_time" TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE "BotConfig" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "BotConfig" ADD COLUMN "away_message" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BotConfig" ADD COLUMN "away_once_per_session" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Contact: add sensitive_flagged column
ALTER TABLE "Contact" ADD COLUMN "sensitive_flagged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Campaign: add scheduled_at column
ALTER TABLE "Campaign" ADD COLUMN "scheduled_at" DATETIME;

-- CreateTable QuickReply
CREATE TABLE "QuickReply" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickReply_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable VerificationTrigger
CREATE TABLE "VerificationTrigger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationTrigger_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable SensitiveKeyword
CREATE TABLE "SensitiveKeyword" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SensitiveKeyword_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable SensitiveFlag
CREATE TABLE "SensitiveFlag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "keyword_matched" TEXT NOT NULL,
    "message_content" TEXT NOT NULL,
    "flagged_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SensitiveFlag_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SensitiveFlag_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
