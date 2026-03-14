/*
  Warnings:

  - You are about to drop the column `changed_at` on the `incident_status_history` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('pending', 'verified');

-- DropIndex
DROP INDEX "idx_incident_status_history_changed_at";

-- DropIndex
DROP INDEX "idx_incident_status_history_changed_by";

-- DropIndex
DROP INDEX "idx_incident_status_history_incident_id";

-- DropIndex
DROP INDEX "idx_traffic_status";

-- AlterTable
ALTER TABLE "incident_status_history" DROP COLUMN "changed_at",
ADD COLUMN     "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
