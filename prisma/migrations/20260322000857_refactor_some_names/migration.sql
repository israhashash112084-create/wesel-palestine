/*
  Warnings:

  - You are about to drop the column `changed_at` on the `incident_status_history` table. All the data in the column will be lost.
  - You are about to drop the column `moderade_by` on the `incidents` table. All the data in the column will be lost.
  - You are about to drop the column `moderaded_at` on the `incidents` table. All the data in the column will be lost.
  - Changed the type of `old_status` on the `incident_status_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `new_status` on the `incident_status_history` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "IncidentStatus" ADD VALUE 'rejected';

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_moderade_by_fkey";

-- DropIndex
DROP INDEX "idx_incidents_verified_by";

-- AlterTable
ALTER TABLE "incident_status_history" DROP COLUMN "changed_at",
ADD COLUMN     "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "old_status",
ADD COLUMN     "old_status" "IncidentStatus" NOT NULL,
DROP COLUMN "new_status",
ADD COLUMN     "new_status" "IncidentStatus" NOT NULL;

-- AlterTable
ALTER TABLE "incidents" DROP COLUMN "moderade_by",
DROP COLUMN "moderaded_at",
ADD COLUMN     "moderated_at" TIMESTAMP(3),
ADD COLUMN     "moderated_by" UUID;

-- AlterTable
ALTER TABLE "reports" ALTER COLUMN "confidence_score" SET DEFAULT 0,
ALTER COLUMN "confidence_score" SET DATA TYPE DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "idx_incidents_moderated_by" ON "incidents"("moderated_by");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
