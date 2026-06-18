-- Migration: add is_favorite to Contact and media_path to Message
-- Run from the backend/ directory: npx prisma db push
-- OR execute this SQL directly if using sqlite3:
--   sqlite3 prisma/dev.db < prisma/migrations/add_favorite_and_media.sql

-- Add is_favorite column to Contact (safe: default false)
ALTER TABLE "Contact" ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT 0;

-- Add media_path column to Message (safe: nullable)
ALTER TABLE "Message" ADD COLUMN "media_path" TEXT;
