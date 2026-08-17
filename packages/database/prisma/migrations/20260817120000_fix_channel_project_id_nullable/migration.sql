-- Fix: PublishingChannel.projectId must be nullable for global channels.
-- The original migration (20260818000000) recreated the FK but forgot to
-- drop the NOT NULL constraint, causing INSERT failures on channel creation.
-- Idempotent: safe to run even if the column is already nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PublishingChannel'
      AND column_name = 'projectId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "PublishingChannel" ALTER COLUMN "projectId" DROP NOT NULL;
  END IF;
END
$$;
