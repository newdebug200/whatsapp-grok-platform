-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "full_description" TEXT NOT NULL DEFAULT '',
    "ia_enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_confirm_enabled" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_AppConfig" ("full_description", "id") SELECT "full_description", "id" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
