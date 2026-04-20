-- CreateTable
CREATE TABLE "checkpoint_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "checkpoint_id" INTEGER NOT NULL,
  "changed_by" UUID,
  "old_status" "TrafficStatus" NOT NULL,
  "new_status" "TrafficStatus" NOT NULL,
  "notes" TEXT,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "checkpoint_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_checkpoint_status_history_checkpoint_id" ON "checkpoint_status_history"("checkpoint_id");

-- CreateIndex
CREATE INDEX "idx_checkpoint_status_history_changed_by" ON "checkpoint_status_history"("changed_by");

-- CreateIndex
CREATE INDEX "idx_checkpoint_status_history_changed_at" ON "checkpoint_status_history"("changed_at" DESC);

-- AddForeignKey
ALTER TABLE "checkpoint_status_history"
ADD CONSTRAINT "checkpoint_status_history_checkpoint_id_fkey"
FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_status_history"
ADD CONSTRAINT "checkpoint_status_history_changed_by_fkey"
FOREIGN KEY ("changed_by") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
