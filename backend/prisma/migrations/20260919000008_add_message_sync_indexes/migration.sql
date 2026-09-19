CREATE INDEX "Message_contact_id_created_at_idx" ON "Message"("contact_id", "created_at");
CREATE INDEX "Message_contact_id_direction_created_at_idx" ON "Message"("contact_id", "direction", "created_at");
