-- This is an empty migration.
-- You can use it to manually adjust your database, or to create an empty migration with `prisma migrate dev --create-only`
-- For more information about migrations, see the documentation:
-- https://www.prisam.io/docs/concepts/migrations

ALTER TABLE "checkpoints"
ADD CONSTRAINT chk_checkpoints_lat
CHECK (latitude BETWEEN -90 AND 90);