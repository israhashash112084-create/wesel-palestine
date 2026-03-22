-- CreateTable
CREATE TABLE "route_history" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "from_lat" DECIMAL(10,8) NOT NULL,
    "from_lng" DECIMAL(11,8) NOT NULL,
    "to_lat" DECIMAL(10,8) NOT NULL,
    "to_lng" DECIMAL(11,8) NOT NULL,
    "distance_km" DECIMAL(8,2) NOT NULL,
    "base_duration_minutes" DECIMAL(8,2) NOT NULL,
    "final_duration_minutes" DECIMAL(8,2) NOT NULL,
    "total_delay_minutes" INTEGER NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_route_history_user_id" ON "route_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_route_history_created_at" ON "route_history"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "route_history" ADD CONSTRAINT "route_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
