-- CreateTable WhatsAppProfile
CREATE TABLE "WhatsAppProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "phone_number" TEXT NOT NULL DEFAULT 'unknown',
    "display_name" TEXT,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppProfile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- UniqueIndex on WhatsAppProfile
CREATE UNIQUE INDEX "WhatsAppProfile_account_id_phone_number_key" ON "WhatsAppProfile"("account_id", "phone_number");

-- Insert one default profile per existing account
INSERT INTO "WhatsAppProfile" ("account_id", "phone_number", "display_name", "is_connected")
SELECT id, 'unknown', 'Profil par défaut', false FROM "Account";

-- Recreate Contact with profile_id
CREATE TABLE "new_Contact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ia_paused" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Contact_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Contact" ("id", "profile_id", "phone_number", "name", "created_at", "ia_paused")
SELECT c.id, wp.id, c.phone_number, c.name, c.created_at, COALESCE(c.ia_paused, 0)
FROM "Contact" c
JOIN "WhatsAppProfile" wp ON wp.account_id = c.account_id;

DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE UNIQUE INDEX "Contact_profile_id_phone_number_key" ON "Contact"("profile_id", "phone_number");

-- Recreate BotConfig with profile_id
CREATE TABLE "new_BotConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "bot_name" TEXT NOT NULL DEFAULT 'Botora',
    "bot_info" TEXT NOT NULL DEFAULT '',
    "bot_behavior" TEXT NOT NULL DEFAULT '',
    "ia_enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BotConfig_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_BotConfig" ("id", "profile_id", "bot_name", "bot_info", "bot_behavior", "ia_enabled")
SELECT b.id, wp.id, b.bot_name, b.bot_info, b.bot_behavior, b.ia_enabled
FROM "BotConfig" b
JOIN "WhatsAppProfile" wp ON wp.account_id = b.account_id;

DROP TABLE "BotConfig";
ALTER TABLE "new_BotConfig" RENAME TO "BotConfig";
CREATE UNIQUE INDEX "BotConfig_profile_id_key" ON "BotConfig"("profile_id");

-- Recreate FAQ with profile_id
CREATE TABLE "new_FAQ" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FAQ_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_FAQ" ("id", "profile_id", "question", "answer", "created_at", "updated_at")
SELECT f.id, wp.id, f.question, f.answer, f.created_at, f.updated_at
FROM "FAQ" f
JOIN "WhatsAppProfile" wp ON wp.account_id = f.account_id;

DROP TABLE "FAQ";
ALTER TABLE "new_FAQ" RENAME TO "FAQ";

-- Drop old WhatsAppSession (replaced by WhatsAppProfile)
DROP TABLE IF EXISTS "WhatsAppSession";
