-- AlterTable
ALTER TABLE "route_cache" ADD COLUMN     "areas" TEXT[],
ADD COLUMN     "checkpoint_ids" INTEGER[];
