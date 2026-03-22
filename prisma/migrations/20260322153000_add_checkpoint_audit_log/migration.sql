-- CreateEnum
CREATE TYPE "CheckpointAuditAction" AS ENUM ('created', 'updated', 'deleted');

-- CreateTable
CREATE TABLE "checkpoint_audit_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "checkpoint_id" INTEGER NOT NULL,
  "checkpoint_ref_id" INTEGER,
  "actor_id" UUID,
  "action" "CheckpointAuditAction" NOT NULL,
  "reason" TEXT,
  "old_values" JSONB,
  "new_values" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "checkpoint_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_checkpoint_audit_checkpoint_id" ON "checkpoint_audit_log"("checkpoint_id");

-- CreateIndex
CREATE INDEX "idx_checkpoint_audit_checkpoint_ref_id" ON "checkpoint_audit_log"("checkpoint_ref_id");

-- CreateIndex
CREATE INDEX "idx_checkpoint_audit_actor_id" ON "checkpoint_audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "idx_checkpoint_audit_action" ON "checkpoint_audit_log"("action");

-- CreateIndex
CREATE INDEX "idx_checkpoint_audit_created_at" ON "checkpoint_audit_log"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "checkpoint_audit_log"
ADD CONSTRAINT "checkpoint_audit_log_checkpoint_ref_id_fkey"
FOREIGN KEY ("checkpoint_ref_id") REFERENCES "checkpoints"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_audit_log"
ADD CONSTRAINT "checkpoint_audit_log_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
