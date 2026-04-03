-- CreateTable
CREATE TABLE "report_notifications" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_report_notifications_user_id" ON "report_notifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_report_notifications_report_id" ON "report_notifications"("report_id");

-- AddForeignKey
ALTER TABLE "report_notifications" ADD CONSTRAINT "report_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_notifications" ADD CONSTRAINT "report_notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
