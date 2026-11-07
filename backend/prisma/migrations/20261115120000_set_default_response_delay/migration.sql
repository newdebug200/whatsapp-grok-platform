-- Use two minutes for the default and keep existing settings in the supported range.
UPDATE "BotConfig" SET "response_delay_seconds" = 120 WHERE "response_delay_seconds" = 15;
UPDATE "BotConfig" SET "response_delay_seconds" = 60 WHERE "response_delay_seconds" < 60;
