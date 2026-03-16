-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "incident_id" INTEGER;

-- CreateIndex
CREATE INDEX "reports_incident_id_idx" ON "reports"("incident_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
