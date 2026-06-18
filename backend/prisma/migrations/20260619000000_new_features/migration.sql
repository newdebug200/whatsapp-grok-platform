-- Add new columns to Contact
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "funnel_stage" TEXT NOT NULL DEFAULT 'prospect';
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "unread_count" INTEGER NOT NULL DEFAULT 0;

-- Add new columns to Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "unread" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "sentiment" TEXT;

-- Add new columns to CampaignMessage
ALTER TABLE "CampaignMessage" ADD COLUMN IF NOT EXISTS "media_url" TEXT;
ALTER TABLE "CampaignMessage" ADD COLUMN IF NOT EXISTS "media_type" TEXT;

-- Add new columns to BotConfig
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "personality" TEXT NOT NULL DEFAULT 'professional';
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "system_prompt_override" TEXT;
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "sentiment_alert" BOOLEAN NOT NULL DEFAULT true;

-- Create ContactMemory table
CREATE TABLE IF NOT EXISTS "ContactMemory" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "contact_id" INTEGER NOT NULL UNIQUE,
  "summary" TEXT NOT NULL,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "ContactMemory_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
