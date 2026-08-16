-- Content campaign -> multi-channel publishing upgrade.
-- Adds: ContentCampaign, CampaignKnowledge, CampaignChannelAssignment, PublishingAccount,
-- and campaign/variant fields on existing models. Hand-maintained; must stay in sync
-- with prisma/schema.prisma. Backward compatible: existing columns/relations unchanged.

-- Enums -------------------------------------------------------------------

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "PublishingAccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'DISCONNECTED');

-- PublishingAccount ------------------------------------------------------

CREATE TABLE "PublishingAccount" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "platform" "ChannelPlatform" NOT NULL DEFAULT 'FACEBOOK',
    "accountName" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "credentials" TEXT NOT NULL,
    "status" "PublishingAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublishingAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublishingAccount_projectId_idx" ON "PublishingAccount"("projectId");

ALTER TABLE "PublishingAccount"
    ADD CONSTRAINT "PublishingAccount_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PublishingChannel.publishingAccountId ----------------------------------

ALTER TABLE "PublishingChannel" ADD COLUMN "publishingAccountId" UUID;

ALTER TABLE "PublishingChannel"
    ADD CONSTRAINT "PublishingChannel_publishingAccountId_fkey"
    FOREIGN KEY ("publishingAccountId") REFERENCES "PublishingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PublishingChannel_publishingAccountId_idx" ON "PublishingChannel"("publishingAccountId");

-- ContentCampaign --------------------------------------------------------

CREATE TABLE "ContentCampaign" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "dailyVideoTarget" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "aiInstructions" TEXT,
    "contentRules" JSONB,
    "contentProfile" JSONB,
    "visualProfile" JSONB,
    "voiceProfile" JSONB,
    "videoProfile" JSONB,
    "providerOverrides" JSONB,
    "automation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentCampaign_projectId_idx" ON "ContentCampaign"("projectId");
CREATE INDEX "ContentCampaign_status_idx" ON "ContentCampaign"("status");

ALTER TABLE "ContentCampaign"
    ADD CONSTRAINT "ContentCampaign_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CampaignKnowledge ------------------------------------------------------

CREATE TABLE "CampaignKnowledge" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "type" "KnowledgeType" NOT NULL DEFAULT 'TEXT',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignKnowledge_campaignId_idx" ON "CampaignKnowledge"("campaignId");

ALTER TABLE "CampaignKnowledge"
    ADD CONSTRAINT "CampaignKnowledge_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CampaignChannelAssignment ----------------------------------------------

CREATE TABLE "CampaignChannelAssignment" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "publishingChannelId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "languageOverride" TEXT,
    "voiceProfileOverride" JSONB,
    "visualProfileOverride" JSONB,
    "videoProfileOverride" JSONB,
    "captionInstructions" TEXT,
    "scheduleOverride" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignChannelAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignChannelAssignment_campaignId_publishingChannelId_key"
    ON "CampaignChannelAssignment"("campaignId", "publishingChannelId");
CREATE INDEX "CampaignChannelAssignment_publishingChannelId_idx" ON "CampaignChannelAssignment"("publishingChannelId");

ALTER TABLE "CampaignChannelAssignment"
    ADD CONSTRAINT "CampaignChannelAssignment_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignChannelAssignment"
    ADD CONSTRAINT "CampaignChannelAssignment_publishingChannelId_fkey"
    FOREIGN KEY ("publishingChannelId") REFERENCES "PublishingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ContentSeries.campaignId + nullable channel (campaign-scoped series) ------

ALTER TABLE "ContentSeries" ADD COLUMN "campaignId" UUID;
ALTER TABLE "ContentSeries" ALTER COLUMN "channelId" DROP NOT NULL;

ALTER TABLE "ContentSeries"
    ADD CONSTRAINT "ContentSeries_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ContentSeries_campaignId_idx" ON "ContentSeries"("campaignId");

-- Content: campaign / language / variant ---------------------------------

ALTER TABLE "Content" ADD COLUMN "campaignId" UUID;
ALTER TABLE "Content" ADD COLUMN "language" TEXT;
ALTER TABLE "Content" ADD COLUMN "variantOfContentId" UUID;

ALTER TABLE "Content"
    ADD CONSTRAINT "Content_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Content"
    ADD CONSTRAINT "Content_variantOfContentId_fkey"
    FOREIGN KEY ("variantOfContentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Content_campaignId_idx" ON "Content"("campaignId");
CREATE INDEX "Content_variantOfContentId_idx" ON "Content"("variantOfContentId");

-- Video.campaignId --------------------------------------------------------

ALTER TABLE "Video" ADD COLUMN "campaignId" UUID;

ALTER TABLE "Video"
    ADD CONSTRAINT "Video_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Video_campaignId_idx" ON "Video"("campaignId");

-- Schedule.campaignId -----------------------------------------------------

ALTER TABLE "Schedule" ADD COLUMN "campaignId" UUID;

ALTER TABLE "Schedule"
    ADD CONSTRAINT "Schedule_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Schedule_campaignId_idx" ON "Schedule"("campaignId");

-- PublishingJob: campaign + optional facebook page ------------------------

ALTER TABLE "PublishingJob" ADD COLUMN "campaignId" UUID;
ALTER TABLE "PublishingJob" ALTER COLUMN "facebookPageId" DROP NOT NULL;

ALTER TABLE "PublishingJob"
    ADD CONSTRAINT "PublishingJob_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PublishingJob" DROP CONSTRAINT "PublishingJob_facebookPageId_fkey";
ALTER TABLE "PublishingJob"
    ADD CONSTRAINT "PublishingJob_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PublishingJob_campaignId_idx" ON "PublishingJob"("campaignId");

ALTER TABLE "PublishingJob" ADD COLUMN "descriptionOverride" TEXT;

-- Analytics: campaign + publication level ---------------------------------

ALTER TABLE "Analytics" ADD COLUMN "campaignId" UUID;
ALTER TABLE "Analytics" ADD COLUMN "publishingJobId" UUID;

ALTER TABLE "Analytics"
    ADD CONSTRAINT "Analytics_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ContentCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Analytics"
    ADD CONSTRAINT "Analytics_publishingJobId_fkey"
    FOREIGN KEY ("publishingJobId") REFERENCES "PublishingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Analytics_campaignId_idx" ON "Analytics"("campaignId");
CREATE INDEX "Analytics_publishingJobId_idx" ON "Analytics"("publishingJobId");
