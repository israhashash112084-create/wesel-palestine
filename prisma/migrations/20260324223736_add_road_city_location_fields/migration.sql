/*
  Warnings:

  - You are about to drop the column `area_name` on the `checkpoints` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "IncidentType" ADD VALUE 'checkpoint_status_update';

-- AlterTable
ALTER TABLE "checkpoints" DROP COLUMN "area_name",
ADD COLUMN     "area" VARCHAR(100),
ADD COLUMN     "city" VARCHAR(255),
ADD COLUMN     "road" VARCHAR(255);

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "city" VARCHAR(255),
ADD COLUMN     "road" VARCHAR(255);

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "checkpoint_id" INTEGER,
ADD COLUMN     "city" VARCHAR(255),
ADD COLUMN     "proposed_checkpoint_status" "TrafficStatus",
ADD COLUMN     "road" VARCHAR(255);

-- CreateIndex
CREATE INDEX "idx_checkpoints_location" ON "checkpoints"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "idx_checkpoints_city" ON "checkpoints"("city");

-- CreateIndex
CREATE INDEX "idx_checkpoints_area" ON "checkpoints"("area");

-- CreateIndex
CREATE INDEX "idx_incidents_city" ON "incidents"("city");

-- CreateIndex
CREATE INDEX "idx_incidents_area" ON "incidents"("area");

-- CreateIndex
CREATE INDEX "idx_incidents_road" ON "incidents"("road");

-- CreateIndex
CREATE INDEX "idx_reports_checkpoint_id" ON "reports"("checkpoint_id");

-- CreateIndex
CREATE INDEX "idx_reports_checkpoint_status_dedup" ON "reports"("type", "checkpoint_id", "proposed_checkpoint_status", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_reports_city" ON "reports"("city");

-- CreateIndex
CREATE INDEX "idx_reports_area" ON "reports"("area");

-- CreateIndex
CREATE INDEX "idx_reports_road" ON "reports"("road");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
