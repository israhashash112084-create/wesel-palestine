/*
  Warnings:

  - You are about to drop the column `changedAt` on the `incident_status_history` table. All the data in the column will be lost.
  - You are about to drop the `external_api_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `route_cache` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "incident_status_history" DROP COLUMN "changedAt",
ADD COLUMN     "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "external_api_logs";

-- DropTable
DROP TABLE "route_cache";

-- DropEnum
DROP TYPE "api_service";
