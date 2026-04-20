/*
  Warnings:

  - A unique constraint covering the columns `[incident_id,subscription_id]` on the table `alerts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "alerts_incident_id_subscription_id_key" ON "alerts"("incident_id", "subscription_id");
