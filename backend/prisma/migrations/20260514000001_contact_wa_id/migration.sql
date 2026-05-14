-- Add wa_id column to Contact for storing the real WhatsApp chat ID (supports @lid contacts)
ALTER TABLE "Contact" ADD COLUMN "wa_id" TEXT;
