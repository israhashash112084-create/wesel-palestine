-- CreateEnum
CREATE TYPE "api_service" AS ENUM ('osrm', 'openweathermap');

-- CreateTable
CREATE TABLE "route_cache" (
    "id" SERIAL NOT NULL,
    "cache_key" VARCHAR(64) NOT NULL,
    "from_lat" DECIMAL(10,8) NOT NULL,
    "from_lng" DECIMAL(11,8) NOT NULL,
    "to_lat" DECIMAL(10,8) NOT NULL,
    "to_lng" DECIMAL(11,8) NOT NULL,
    "response_data" JSONB NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_api_logs" (
    "id" SERIAL NOT NULL,
    "service" "api_service" NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "status_code" INTEGER,
    "response_time_ms" INTEGER,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_cache_cache_key_key" ON "route_cache"("cache_key");

-- CreateIndex
CREATE INDEX "route_cache_cache_key_idx" ON "route_cache"("cache_key");

-- CreateIndex
CREATE INDEX "route_cache_expires_at_idx" ON "route_cache"("expires_at");

-- CreateIndex
CREATE INDEX "external_api_logs_service_idx" ON "external_api_logs"("service");

-- CreateIndex
CREATE INDEX "external_api_logs_is_fallback_idx" ON "external_api_logs"("is_fallback");

-- CreateIndex
CREATE INDEX "external_api_logs_created_at_idx" ON "external_api_logs"("created_at" DESC);
