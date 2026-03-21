-- CreateTable
CREATE TABLE "incident_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" INTEGER NOT NULL,
    "changed_by" UUID NOT NULL,
    "old_status" "TrafficStatus" NOT NULL,
    "new_status" "TrafficStatus" NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,

    CONSTRAINT "incident_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_incident_status_history_incident_id" ON "incident_status_history"("incident_id");

-- CreateIndex
CREATE INDEX "idx_incident_status_history_changed_by" ON "incident_status_history"("changed_by");

-- CreateIndex
CREATE INDEX "idx_incident_status_history_changed_at" ON "incident_status_history"("changed_at" DESC);

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
