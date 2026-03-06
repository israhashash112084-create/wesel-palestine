-- Migration: add_device_info_to_refresh_tokens
--
-- Existing refresh token rows are dev/test data and have no device
-- information, so we clear them before adding the required columns.

TRUNCATE TABLE "refresh_tokens";

-- Add device tracking columns (TIMESTAMP(3) matches Prisma's default precision)
ALTER TABLE "refresh_tokens"
  ADD COLUMN "device_id"    VARCHAR(255)   NOT NULL,
  ADD COLUMN "device_name"  VARCHAR(255)   NOT NULL DEFAULT 'Unknown Device',
  ADD COLUMN "created_at"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "last_used_at" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Enforce one active session per device per user
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_user_id_device_id_key" UNIQUE ("user_id", "device_id");
