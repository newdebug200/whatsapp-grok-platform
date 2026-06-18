-- CreateTable Account
CREATE TABLE "Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- CreateTable BotConfig
CREATE TABLE "BotConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "bot_name" TEXT NOT NULL DEFAULT 'Botora',
    "bot_info" TEXT NOT NULL DEFAULT '',
    "bot_behavior" TEXT NOT NULL DEFAULT '',
    "ia_enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BotConfig_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable Contact
CREATE TABLE "Contact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "phone_number" TEXT NOT NULL,
    "wa_id" TEXT,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ia_paused" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Contact_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable Message
CREATE TABLE "Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contact_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable FAQ
CREATE TABLE "FAQ" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FAQ_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable Status
CREATE TABLE "Status" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "wa_msg_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Status_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");
CREATE UNIQUE INDEX "WhatsAppProfile_account_id_phone_number_key" ON "WhatsAppProfile"("account_id", "phone_number");
CREATE UNIQUE INDEX "BotConfig_profile_id_key" ON "BotConfig"("profile_id");
CREATE UNIQUE INDEX "Contact_profile_id_phone_number_key" ON "Contact"("profile_id", "phone_number");
