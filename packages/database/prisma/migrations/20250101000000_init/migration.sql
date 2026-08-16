-- AI Video Factory initial schema
-- Hand-maintained migration; must stay in sync with prisma/schema.prisma

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "ProjectPublishingMode" AS ENUM ('MANUAL', 'SEMI_AUTOMATIC', 'FULL_AUTOMATIC');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'NEEDS_REVIEW', 'FAILED');
CREATE TYPE "ScriptStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "SceneKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "SceneStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'SUBTITLE', 'MUSIC', 'THUMBNAIL');
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'GENERATING', 'RENDERING', 'READY', 'NEEDS_REVIEW', 'FAILED');
CREATE TYPE "RenderJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');
CREATE TYPE "PublishingStatus" AS ENUM ('PENDING', 'UPLOADING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "ScheduleDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');
CREATE TYPE "ProviderType" AS ENUM ('AI', 'IMAGE', 'VIDEO', 'VOICE', 'RESEARCH', 'STORAGE');
CREATE TYPE "VideoTemplate" AS ENUM ('DEFAULT_REELS', 'NEWS', 'FACTS', 'TOP5', 'STORY', 'EDUCATIONAL');
CREATE TYPE "AnalyticsMetric" AS ENUM ('VIEWS', 'LIKES', 'COMMENTS', 'SHARES', 'REACH', 'ENGAGEMENT');
CREATE TYPE "GenerationLogStatus" AS ENUM ('SUCCESS', 'FAILED');
CREATE TYPE "FacebookPageStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED');

-- ---------------------------------------------------------------------------
-- Identity & Access
-- ---------------------------------------------------------------------------

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Content pipeline
-- ---------------------------------------------------------------------------

CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'vi-VN',
    "category" TEXT,
    "defaultTemplate" "VideoTemplate" NOT NULL DEFAULT 'DEFAULT_REELS',
    "defaultVoice" TEXT,
    "defaultAIProvider" TEXT,
    "defaultImageProvider" TEXT,
    "defaultVideoProvider" TEXT,
    "defaultVoiceProvider" TEXT,
    "defaultDurationSeconds" INTEGER NOT NULL DEFAULT 60,
    "publishingMode" "ProjectPublishingMode" NOT NULL DEFAULT 'MANUAL',
    "facebookPageId" UUID,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'vi-VN',
    "frequencyPerDay" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Content" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "topicId" UUID,
    "title" TEXT,
    "hook" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Script" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "hook" TEXT,
    "fullText" TEXT,
    "status" "ScriptStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Scene" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "SceneKind" NOT NULL DEFAULT 'IMAGE',
    "durationSeconds" INTEGER NOT NULL DEFAULT 5,
    "narration" TEXT,
    "visualPrompt" TEXT,
    "subtitleText" TEXT,
    "status" "SceneStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "sceneId" UUID,
    "contentId" UUID,
    "videoId" UUID,
    "type" "MediaType" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "model" TEXT,
    "url" TEXT,
    "fileKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Video" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "template" "VideoTemplate" NOT NULL DEFAULT 'DEFAULT_REELS',
    "resolution" TEXT NOT NULL DEFAULT '1080x1920',
    "fps" INTEGER NOT NULL DEFAULT 30,
    "durationSeconds" INTEGER,
    "fileKey" TEXT,
    "url" TEXT,
    "thumbnailKey" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "qualityScore" INTEGER,
    "qaResult" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RenderJob" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "status" "RenderJobStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB,
    "log" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishingJob" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "facebookPageId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" "PublishingStatus" NOT NULL DEFAULT 'PENDING',
    "facebookPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublishingJob_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------

CREATE TABLE "FacebookPage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "FacebookPageStatus" NOT NULL DEFAULT 'CONNECTED',
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacebookPage_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

CREATE TABLE "Schedule" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled schedule',
    "times" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "days" "ScheduleDay"[] NOT NULL DEFAULT ARRAY[]::"ScheduleDay"[],
    "topicId" UUID,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Provider registry, logging, analytics, settings
-- ---------------------------------------------------------------------------

CREATE TABLE "AIProvider" (
    "id" UUID NOT NULL,
    "projectId" UUID,
    "type" "ProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "projectId" UUID,
    "contentId" UUID,
    "videoId" UUID,
    "jobType" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "status" "GenerationLogStatus" NOT NULL DEFAULT 'SUCCESS',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "requestId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Analytics" (
    "id" UUID NOT NULL,
    "videoId" UUID,
    "projectId" UUID,
    "facebookPostId" TEXT,
    "metric" "AnalyticsMetric" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,
    CONSTRAINT "Analytics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
ALTER TABLE "Session" ADD CONSTRAINT "Session_tokenHash_key" UNIQUE ("tokenHash");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Script" ADD CONSTRAINT "Script_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Script" ADD CONSTRAINT "Script_contentId_key" UNIQUE ("contentId");
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_contentId_order_key" UNIQUE ("contentId", "order");
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Video" ADD CONSTRAINT "Video_contentId_key" UNIQUE ("contentId");
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingJob" ADD CONSTRAINT "PublishingJob_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_pageId_key" UNIQUE ("pageId");
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIProvider" ADD CONSTRAINT "AIProvider_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationLog" ADD CONSTRAINT "GenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationLog" ADD CONSTRAINT "GenerationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_key_key" UNIQUE ("key");

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Topic_projectId_idx" ON "Topic"("projectId");
CREATE INDEX "Content_projectId_idx" ON "Content"("projectId");
CREATE INDEX "Content_topicId_idx" ON "Content"("topicId");
CREATE INDEX "Scene_contentId_idx" ON "Scene"("contentId");
CREATE INDEX "MediaAsset_sceneId_idx" ON "MediaAsset"("sceneId");
CREATE INDEX "MediaAsset_contentId_idx" ON "MediaAsset"("contentId");
CREATE INDEX "MediaAsset_videoId_idx" ON "MediaAsset"("videoId");
CREATE INDEX "Video_projectId_idx" ON "Video"("projectId");
CREATE INDEX "RenderJob_videoId_idx" ON "RenderJob"("videoId");
CREATE INDEX "RenderJob_status_idx" ON "RenderJob"("status");
CREATE INDEX "PublishingJob_videoId_idx" ON "PublishingJob"("videoId");
CREATE INDEX "PublishingJob_status_idx" ON "PublishingJob"("status");
CREATE INDEX "FacebookPage_userId_idx" ON "FacebookPage"("userId");
CREATE INDEX "Schedule_projectId_idx" ON "Schedule"("projectId");
CREATE INDEX "Schedule_status_idx" ON "Schedule"("status");
CREATE INDEX "AIProvider_projectId_idx" ON "AIProvider"("projectId");
CREATE UNIQUE INDEX "AIProvider_projectId_type_provider_model_key" ON "AIProvider"("projectId", "type", "provider", "model");
CREATE INDEX "GenerationLog_userId_idx" ON "GenerationLog"("userId");
CREATE INDEX "GenerationLog_projectId_idx" ON "GenerationLog"("projectId");
CREATE INDEX "GenerationLog_contentId_idx" ON "GenerationLog"("contentId");
CREATE INDEX "Analytics_videoId_idx" ON "Analytics"("videoId");
CREATE INDEX "Analytics_projectId_metric_recordedAt_idx" ON "Analytics"("projectId", "metric", "recordedAt");
