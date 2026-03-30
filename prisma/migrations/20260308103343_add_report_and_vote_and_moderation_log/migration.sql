-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('closure', 'delay', 'accident', 'military_activity', 'weather_hazard', 'road_damage', 'protest', 'construction', 'other');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('up', 'down');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('approved', 'rejected');

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "location_lat" DECIMAL(10,8) NOT NULL,
    "location_lng" DECIMAL(11,8) NOT NULL,
    "area" VARCHAR(255),
    "type" "IncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "confidence_score" INTEGER NOT NULL DEFAULT 0,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "moderated_by" UUID,
    "moderated_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "duplicate_of" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_votes" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "vote" "VoteValue" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_audit_log" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "moderator_id" UUID,
    "action" "ModerationAction" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_reports_user_id" ON "reports"("user_id");

-- CreateIndex
CREATE INDEX "idx_reports_status" ON "reports"("status");

-- CreateIndex
CREATE INDEX "idx_reports_type" ON "reports"("type");

-- CreateIndex
CREATE INDEX "idx_reports_duplicate_of" ON "reports"("duplicate_of");

-- CreateIndex
CREATE INDEX "idx_reports_location" ON "reports"("location_lat", "location_lng");

-- CreateIndex
CREATE INDEX "idx_reports_created_at" ON "reports"("created_at");

-- CreateIndex
CREATE INDEX "idx_report_votes_report_id" ON "report_votes"("report_id");

-- CreateIndex
CREATE INDEX "idx_report_votes_user_id" ON "report_votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_vote" ON "report_votes"("report_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_mod_audit_report_id" ON "moderation_audit_log"("report_id");

-- CreateIndex
CREATE INDEX "idx_mod_audit_moderator_id" ON "moderation_audit_log"("moderator_id");

-- CreateIndex
CREATE INDEX "idx_mod_audit_created_at" ON "moderation_audit_log"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_duplicate_of_fkey" FOREIGN KEY ("duplicate_of") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_votes" ADD CONSTRAINT "report_votes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_votes" ADD CONSTRAINT "report_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_audit_log" ADD CONSTRAINT "moderation_audit_log_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_audit_log" ADD CONSTRAINT "moderation_audit_log_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
