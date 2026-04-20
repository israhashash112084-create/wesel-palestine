-- CreateTable
CREATE TABLE "alert_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "area_lat" DECIMAL(10,8) NOT NULL,
    "area_lng" DECIMAL(11,8) NOT NULL,
    "radius_km" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "category" TEXT NOT NULL DEFAULT 'all',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "incident_id" INTEGER NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_alert_subscriptions_user_id" ON "alert_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_alerts_incident_id" ON "alerts"("incident_id");

-- CreateIndex
CREATE INDEX "idx_alerts_subscription_id" ON "alerts"("subscription_id");

-- AddForeignKey
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "alert_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
