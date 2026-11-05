CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  "id"             INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "profile_id"     INTEGER NOT NULL,
  "file_name"      TEXT NOT NULL,
  "category"       TEXT NOT NULL,
  "mime_type"      TEXT NOT NULL,
  "file_size"      INTEGER NOT NULL,
  "extracted_text" TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "validated_at"   DATETIME,
  "created_at"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     DATETIME NOT NULL,
  FOREIGN KEY ("profile_id") REFERENCES "WhatsAppProfile"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "KnowledgeDocument_profile_id_status_idx"
  ON "KnowledgeDocument"("profile_id", "status");
