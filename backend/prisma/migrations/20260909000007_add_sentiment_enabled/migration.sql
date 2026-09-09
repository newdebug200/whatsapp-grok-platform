-- Sentiment analysis is an optional, billable AI feature and is disabled by default.
ALTER TABLE "BotConfig" ADD COLUMN "sentiment_enabled" BOOLEAN NOT NULL DEFAULT false;
