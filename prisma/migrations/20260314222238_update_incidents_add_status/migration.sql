/*
  Warnings:

  - You are about to drop the column `changed_at` on the `incident_status_history` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "IncidentStatus" ADD VALUE 'closed';

-- DropIndex
DROP INDEX "idx_incident_status_history_changed_at";

-- DropIndex
DROP INDEX "idx_incident_status_history_changed_by";

-- DropIndex
DROP INDEX "idx_incident_status_history_incident_id";

-- AlterTable
ALTER TABLE "incident_status_history" DROP COLUMN "changed_at",
ADD COLUMN     "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "status" "IncidentStatus" NOT NULL DEFAULT 'pending';
