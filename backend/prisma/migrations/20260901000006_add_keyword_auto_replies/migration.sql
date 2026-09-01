CREATE TABLE "KeywordAutoReply" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "central_id" INTEGER,
    "profile_id" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "keyword_normalized" TEXT NOT NULL,
    "response_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "central_updated_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "KeywordAutoReply_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "KeywordAutoReply_central_id_key" ON "KeywordAutoReply"("central_id");
CREATE UNIQUE INDEX "KeywordAutoReply_profile_id_keyword_normalized_key" ON "KeywordAutoReply"("profile_id", "keyword_normalized");
CREATE INDEX "KeywordAutoReply_profile_id_is_active_idx" ON "KeywordAutoReply"("profile_id", "is_active");
