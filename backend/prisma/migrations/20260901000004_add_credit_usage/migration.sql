CREATE TABLE "CreditUsage" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id" INTEGER NOT NULL,
  "event_type" TEXT NOT NULL,
  "tokens_used" INTEGER NOT NULL,
  "credits_used" REAL NOT NULL,
  "tokens_per_unit" INTEGER NOT NULL DEFAULT 100000,
  "credits_per_unit" REAL NOT NULL DEFAULT 1,
  "xof_per_unit" REAL NOT NULL DEFAULT 120,
  "metadata" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditUsage_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreditUsage_account_id_created_at_idx" ON "CreditUsage"("account_id", "created_at");
CREATE INDEX "CreditUsage_created_at_idx" ON "CreditUsage"("created_at");
