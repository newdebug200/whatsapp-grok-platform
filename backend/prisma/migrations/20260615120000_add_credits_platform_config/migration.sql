-- AlterTable Account: add credit balance and blocked status
ALTER TABLE "Account" ADD COLUMN "credit_balance" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Account" ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable PlatformConfig
CREATE TABLE "PlatformConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- Seed default feature flags and credit settings
INSERT INTO "PlatformConfig" ("key", "value") VALUES
    ('campaigns_enabled', 'true'),
    ('ia_enabled_global', 'true'),
    ('sensitive_keywords_enabled', 'true'),
    ('verification_triggers_enabled', 'true'),
    ('credits_enabled', 'false'),
    ('credit_per_1000_tokens', '1'),
    ('new_user_free_credits', '0');

-- CreateTable CreditTransaction
CREATE TABLE "CreditTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "tokens_used" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditTransaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
