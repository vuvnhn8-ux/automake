-- Channels become a global, user-owned registry. Channels are no longer tied
-- to a single project: new channels carry a userId and projectId stays null.
-- Legacy rows keep their projectId as a creator back-reference; the foreign
-- key is relaxed to ON DELETE SET NULL so deleting a project never removes a
-- global channel. All changes are additive (new columns/enums), no data loss.

-- CreateEnum
CREATE TYPE "ChannelDistributionMode" AS ENUM ('SAME_CONTENT', 'CHANNEL_VARIANT');

-- AlterTable
ALTER TABLE "PublishingChannel"
    ADD COLUMN "userId" UUID,
    ADD COLUMN "distributionMode" "ChannelDistributionMode" NOT NULL DEFAULT 'SAME_CONTENT';

-- AlterTable
ALTER TABLE "PublishingJob"
    ADD COLUMN "projectId" UUID,
    ADD COLUMN "contentId" UUID,
    ADD COLUMN "platform" "ChannelPlatform";

-- Relax the channel -> project FK so channels survive project deletion.
ALTER TABLE "PublishingChannel" DROP CONSTRAINT "PublishingChannel_projectId_fkey";
ALTER TABLE "PublishingChannel"
    ADD CONSTRAINT "PublishingChannel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingChannel"
    ADD CONSTRAINT "PublishingChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingJob"
    ADD CONSTRAINT "PublishingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingJob"
    ADD CONSTRAINT "PublishingJob_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PublishingChannel_userId_idx" ON "PublishingChannel"("userId");

-- CreateIndex
CREATE INDEX "PublishingJob_projectId_idx" ON "PublishingJob"("projectId");

-- CreateIndex
CREATE INDEX "PublishingJob_contentId_idx" ON "PublishingJob"("contentId");
