/*
  Warnings:

  - The values [resolved,closed] on the enum `IncidentStatus` will be removed. If these variants are still used in the database, this will fail.
  - The `status` column on the `checkpoints` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `is_verified` on the `incidents` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `incidents` table. All the data in the column will be lost.
  - Made the column `reported_by` on table `incidents` required. This step will fail if there are existing NULL values in that column.

*/
-- Ensure NULL reporters can be backfilled before enforcing NOT NULL.
INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "first_name",
  "last_name",
  "role",
  "confidence_score",
  "created_at",
  "updated_at"
)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'system.placeholder@wesal.local',
  '$2b$12$9i5j1WmA0Yq3W9Yw4vE8hOmfQ9D4K0uJf4JtQ9hW1jS7R2vT8x9aK',
  'System',
  'Placeholder',
  'user'::"Role",
  0.0,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "incidents"
SET "reported_by" = '00000000-0000-0000-0000-000000000000'::uuid
WHERE "reported_by" IS NULL;

-- CreateEnum
CREATE TYPE "TrafficStatus" AS ENUM ('open', 'closed', 'slow', 'unknown');

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_reported_by_fkey";

-- DropIndex
DROP INDEX "idx_incidents_is_verified";

-- DropIndex
DROP INDEX "idx_incidents_status";

-- Convert status values to the new enum without dropping checkpoint data.
ALTER TABLE "checkpoints" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "checkpoints"
  ALTER COLUMN "status" TYPE "TrafficStatus"
  USING LOWER("status"::text)::"TrafficStatus";
ALTER TABLE "checkpoints" ALTER COLUMN "status" SET DEFAULT 'open';

-- AlterTable
ALTER TABLE "incidents" DROP COLUMN "is_verified",
DROP COLUMN "status",
ADD COLUMN     "traffic_status" "TrafficStatus" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "verified_by" UUID,
ALTER COLUMN "reported_by" SET NOT NULL;

-- DropEnum
DROP TYPE "IncidentStatus";

-- DropEnum
DROP TYPE "CheckpointStatus";

-- CreateIndex
CREATE INDEX "idx_traffic_status" ON "incidents"("traffic_status");

-- CreateIndex
CREATE INDEX "idx_incidents_verified_by" ON "incidents"("verified_by");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
