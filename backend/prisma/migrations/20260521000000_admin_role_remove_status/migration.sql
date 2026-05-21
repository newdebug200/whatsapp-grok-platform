-- Add role column to Account (admin for first user, user for others)
ALTER TABLE "Account" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- Drop Status table (feature removed)
DROP TABLE IF EXISTS "Status";
