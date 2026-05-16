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
