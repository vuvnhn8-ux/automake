-- Fix: PublishingChannel.projectId must be nullable for global channels.
-- The original migration (20260818000000) recreated the FK but forgot to
-- drop the NOT NULL constraint, causing INSERT failures on channel creation.
ALTER TABLE "PublishingChannel" ALTER COLUMN "projectId" DROP NOT NULL;
