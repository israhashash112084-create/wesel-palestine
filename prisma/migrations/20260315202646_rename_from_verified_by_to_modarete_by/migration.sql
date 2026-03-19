/*
  Warnings:

  - You are about to drop the column `verified_at` on the `incidents` table. All the data in the column will be lost.
  - You are about to drop the column `verified_by` on the `incidents` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_verified_by_fkey";

-- DropIndex
DROP INDEX "idx_incidents_verified_by";

-- AlterTable
ALTER TABLE "incidents" DROP COLUMN "verified_at",
DROP COLUMN "verified_by",
ADD COLUMN     "moderade_by" UUID,
ADD COLUMN     "moderaded_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "idx_incidents_verified_by" ON "incidents"("moderade_by");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_moderade_by_fkey" FOREIGN KEY ("moderade_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
