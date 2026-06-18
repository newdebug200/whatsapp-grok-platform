-- Add response_delay_seconds to BotConfig
ALTER TABLE "BotConfig" ADD COLUMN "response_delay_seconds" INTEGER NOT NULL DEFAULT 5;

-- Add password reset fields to Account
ALTER TABLE "Account" ADD COLUMN "reset_token" TEXT;
ALTER TABLE "Account" ADD COLUMN "reset_token_expiry" DATETIME;
