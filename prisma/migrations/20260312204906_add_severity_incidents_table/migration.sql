/*
  Warnings:

  - Added the required column `severity` to the `reports` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('pending', 'verified', 'resolved', 'closed');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "severity" "IncidentSeverity" NOT NULL;

-- CreateTable
CREATE TABLE "incidents" (
    "id" SERIAL NOT NULL,
    "checkpoint_id" INTEGER,
    "reported_by" UUID,
    "location_lat" DECIMAL(10,8) NOT NULL,
    "location_lng" DECIMAL(11,8) NOT NULL,
    "area" VARCHAR(255),
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'pending',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_incidents_checkpoint_id" ON "incidents"("checkpoint_id");

-- CreateIndex
CREATE INDEX "idx_incidents_type" ON "incidents"("type");

-- CreateIndex
CREATE INDEX "idx_incidents_severity" ON "incidents"("severity");

-- CreateIndex
CREATE INDEX "idx_incidents_status" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "idx_incidents_is_verified" ON "incidents"("is_verified");

-- CreateIndex
CREATE INDEX "idx_incidents_reported_by" ON "incidents"("reported_by");

-- CreateIndex
CREATE INDEX "idx_incidents_created_at" ON "incidents"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
