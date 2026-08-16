-- Channel content profile + content series + AI content strategy
-- Hand-maintained migration; must stay in sync with prisma/schema.prisma

CREATE TYPE "ChannelPlatform" AS ENUM ('FACEBOOK', 'YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'OTHER');
CREATE TYPE "TopicSource" AS ENUM ('MANUAL', 'AI');
CREATE TYPE "KnowledgeType" AS ENUM ('TEXT', 'TXT', 'MARKDOWN', 'PDF', 'URL');

-- ---------------------------------------------------------------------------
-- PublishingChannel
-- ---------------------------------------------------------------------------

CREATE TABLE "PublishingChannel" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "ChannelPlatform" NOT NULL DEFAULT 'FACEBOOK',
    "description" TEXT,
    "dailyVideoTarget" INTEGER NOT NULL DEFAULT 1,
    "autoGenerationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublishingChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelContentProfile" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "description" TEXT,
    "audience" TEXT,
    "language" TEXT NOT NULL DEFAULT 'vi-VN',
    "tone" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "contentStyle" TEXT,
    "videoStyle" TEXT,
    "defaultDurationSeconds" INTEGER,
    "defaultTemplate" TEXT,
    "aiInstructions" TEXT,
    "contentRules" JSONB,
    "excludedTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelContentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentSeries" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "excludedTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "language" TEXT,
    "tone" TEXT,
    "durationSeconds" INTEGER,
    "frequencyPerDay" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelKnowledge" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
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
    CONSTRAINT "ChannelKnowledge_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Extend existing tables with channel/series/topic references
-- ---------------------------------------------------------------------------

ALTER TABLE "Topic" ADD COLUMN "seriesId" UUID;
ALTER TABLE "Topic" ADD COLUMN "source" "TopicSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Topic" ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Content" ADD COLUMN "channelId" UUID;
ALTER TABLE "Content" ADD COLUMN "seriesId" UUID;

ALTER TABLE "Video" ADD COLUMN "channelId" UUID;
ALTER TABLE "Video" ADD COLUMN "seriesId" UUID;

ALTER TABLE "Schedule" ADD COLUMN "channelId" UUID;
ALTER TABLE "Schedule" ADD COLUMN "seriesId" UUID;

ALTER TABLE "PublishingJob" ADD COLUMN "channelId" UUID;
ALTER TABLE "PublishingJob" ADD COLUMN "seriesId" UUID;

ALTER TABLE "Analytics" ADD COLUMN "channelId" UUID;
ALTER TABLE "Analytics" ADD COLUMN "seriesId" UUID;
ALTER TABLE "Analytics" ADD COLUMN "topicId" UUID;

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "PublishingChannel" ADD CONSTRAINT "PublishingChannel_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelContentProfile" ADD CONSTRAINT "ChannelContentProfile_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentSeries" ADD CONSTRAINT "ContentSeries_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChannelKnowledge" ADD CONSTRAINT "ChannelKnowledge_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Topic" ADD CONSTRAINT "Topic_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ContentSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Content" ADD CONSTRAINT "Content_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ContentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Video" ADD CONSTRAINT "Video_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ContentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ContentSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ContentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "PublishingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ContentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "PublishingChannel_projectId_idx" ON "PublishingChannel"("projectId");
CREATE INDEX "ContentSeries_channelId_idx" ON "ContentSeries"("channelId");
CREATE INDEX "ChannelKnowledge_channelId_idx" ON "ChannelKnowledge"("channelId");
CREATE INDEX "Topic_seriesId_idx" ON "Topic"("seriesId");
CREATE INDEX "Content_channelId_idx" ON "Content"("channelId");
CREATE INDEX "Content_seriesId_idx" ON "Content"("seriesId");
CREATE INDEX "Video_channelId_idx" ON "Video"("channelId");
CREATE INDEX "Video_seriesId_idx" ON "Video"("seriesId");
CREATE INDEX "Schedule_channelId_idx" ON "Schedule"("channelId");
CREATE INDEX "Schedule_seriesId_idx" ON "Schedule"("seriesId");
CREATE INDEX "PublishingJob_channelId_idx" ON "PublishingJob"("channelId");
CREATE INDEX "PublishingJob_seriesId_idx" ON "PublishingJob"("seriesId");
CREATE INDEX "Analytics_channelId_idx" ON "Analytics"("channelId");
CREATE INDEX "Analytics_seriesId_idx" ON "Analytics"("seriesId");

CREATE UNIQUE INDEX "ChannelContentProfile_channelId_key" ON "ChannelContentProfile"("channelId");
