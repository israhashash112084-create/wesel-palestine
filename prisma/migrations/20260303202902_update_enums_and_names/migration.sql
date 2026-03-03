/*
  Warnings:

  - The values [OPEN,CLOSED,SLOW,UNKNOWN] on the enum `CheckpointStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [USER,MODERATOR,ADMIN] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `confidance_score` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `users` table. All the data in the column will be lost.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CheckpointStatus_new" AS ENUM ('open', 'closed', 'slow', 'unknown');
ALTER TABLE "checkpoints" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "checkpoints" ALTER COLUMN "status" TYPE "CheckpointStatus_new" USING ("status"::text::"CheckpointStatus_new");
ALTER TYPE "CheckpointStatus" RENAME TO "CheckpointStatus_old";
ALTER TYPE "CheckpointStatus_new" RENAME TO "CheckpointStatus";
DROP TYPE "CheckpointStatus_old";
ALTER TABLE "checkpoints" ALTER COLUMN "status" SET DEFAULT 'open';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('user', 'moderator', 'admin');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';
COMMIT;

-- AlterTable
ALTER TABLE "checkpoints" ALTER COLUMN "status" SET DEFAULT 'open';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "confidance_score",
DROP COLUMN "password",
ADD COLUMN     "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "password_hash" VARCHAR(255) NOT NULL,
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "role" SET DEFAULT 'user';
