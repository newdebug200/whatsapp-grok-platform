ALTER TABLE "Message" ADD COLUMN "wa_msg_id" TEXT;
ALTER TABLE "BotConfig" ADD COLUMN "ia_group_enabled" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Message_wa_msg_id_idx" ON "Message"("wa_msg_id");
ALTER TABLE "Message" ADD COLUMN "media_filename" TEXT;
ALTER TABLE "Message" ADD COLUMN "media_mime" TEXT;
