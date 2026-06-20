-- Add new columns to Contact
-- SQLite : "IF NOT EXISTS" n'est pas supporté — les erreurs de doublon sont ignorées par Prisma
ALTER TABLE "Contact" ADD COLUMN "notes" TEXT;
ALTER TABLE "Contact" ADD COLUMN "funnel_stage" TEXT NOT NULL DEFAULT 'prospect';
ALTER TABLE "Contact" ADD COLUMN "unread_count" INTEGER NOT NULL DEFAULT 0;

-- Add new columns to Message
ALTER TABLE "Message" ADD COLUMN "unread" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Message" ADD COLUMN "sentiment" TEXT;

-- Add new columns to CampaignMessage
ALTER TABLE "CampaignMessage" ADD COLUMN "media_url" TEXT;
ALTER TABLE "CampaignMessage" ADD COLUMN "media_type" TEXT;

-- Add new columns to BotConfig
ALTER TABLE "BotConfig" ADD COLUMN "personality" TEXT NOT NULL DEFAULT 'professional';
ALTER TABLE "BotConfig" ADD COLUMN "system_prompt_override" TEXT;
ALTER TABLE "BotConfig" ADD COLUMN "sentiment_alert" BOOLEAN NOT NULL DEFAULT true;

-- Create ContactMemory table
CREATE TABLE IF NOT EXISTS "ContactMemory" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "contact_id" INTEGER NOT NULL UNIQUE,
  "summary" TEXT NOT NULL,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "ContactMemory_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
