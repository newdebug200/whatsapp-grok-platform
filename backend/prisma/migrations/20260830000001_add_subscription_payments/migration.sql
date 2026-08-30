CREATE TABLE "SubscriptionPayment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "account_id" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'fedapay',
  "external_id" TEXT NOT NULL,
  "amount_xof" INTEGER NOT NULL,
  "duration_days" INTEGER NOT NULL DEFAULT 365,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "description" TEXT,
  "metadata" TEXT,
  "approved_at" DATETIME,
  "last_checked_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "SubscriptionPayment_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SubscriptionPayment_external_id_key" ON "SubscriptionPayment"("external_id");
CREATE INDEX "SubscriptionPayment_account_id_created_at_idx" ON "SubscriptionPayment"("account_id", "created_at");
CREATE INDEX "SubscriptionPayment_account_id_status_idx" ON "SubscriptionPayment"("account_id", "status");
