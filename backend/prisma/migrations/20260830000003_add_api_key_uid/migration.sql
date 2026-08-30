ALTER TABLE "ApiKey" ADD COLUMN "key_uid" TEXT;

UPDATE "ApiKey"
SET "key_uid" = lower(hex(randomblob(16)))
WHERE "key_uid" IS NULL;

CREATE UNIQUE INDEX "ApiKey_key_uid_key" ON "ApiKey"("key_uid");
