CREATE TABLE "ApiKey" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "last_used_at" DATETIME,
  "revoked_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "ApiKey_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApiKey_key_hash_key" ON "ApiKey"("key_hash");
CREATE INDEX "ApiKey_account_id_revoked_at_idx" ON "ApiKey"("account_id", "revoked_at");
