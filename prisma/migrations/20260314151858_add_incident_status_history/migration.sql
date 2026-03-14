/*
  Warnings:

  - You are about to drop the column `changed_at` on the `incident_status_history` table. All the data in the column will be lost.

*/
-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'IncidentStatus'
  ) THEN
    CREATE TYPE "IncidentStatus" AS ENUM ('pending', 'verified');
  END IF;
END
$$;

-- DropIndex
DROP INDEX IF EXISTS "idx_incident_status_history_changed_at";

-- DropIndex
DROP INDEX IF EXISTS "idx_incident_status_history_changed_by";

-- DropIndex
DROP INDEX IF EXISTS "idx_incident_status_history_incident_id";

-- DropIndex
DROP INDEX IF EXISTS "idx_traffic_status";

-- AlterTable
ALTER TABLE IF EXISTS "incident_status_history"
  DROP COLUMN IF EXISTS "changed_at",
  ADD COLUMN IF NOT EXISTS "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
