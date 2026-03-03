-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('OPEN', 'CLOSED', 'SLOW', 'UNKNOWN');

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "area_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "latitude" DECIMAL(10,6) NOT NULL,
    "longitude" DECIMAL(10,6) NOT NULL,
    "status" "CheckpointStatus" NOT NULL DEFAULT 'OPEN',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
