-- CreateIndex
CREATE UNIQUE INDEX "uq_checkpoints_lat_lng_exact" ON "checkpoints"("latitude", "longitude");
