-- CreateTable
CREATE TABLE "DressurQueueItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "source_key" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "wa_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "DressurQueueItem_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DressurQueueItem_account_id_source_key_key" ON "DressurQueueItem"("account_id", "source_key");
CREATE INDEX "DressurQueueItem_account_id_status_idx" ON "DressurQueueItem"("account_id", "status");
