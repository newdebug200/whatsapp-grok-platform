-- Move existing untouched default values to the new 15-second grouping delay.
UPDATE "BotConfig" SET "response_delay_seconds" = 15 WHERE "response_delay_seconds" = 5;
