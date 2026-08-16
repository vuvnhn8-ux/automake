-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "config" JSONB,
ADD COLUMN     "dailyVideoTarget" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo';

-- AlterTable
ALTER TABLE "PublishingChannel" ADD COLUMN     "connectionStatus" "ChannelConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "tokenStatus" TEXT;

-- CreateTable
CREATE TABLE "ProjectChannelAssignment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "publishingChannelId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "captionFormat" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "titleFormat" TEXT,
    "descriptionTemplate" TEXT,
    "scheduleOverride" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChannelAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
    "id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT DEFAULT '',
    "requests" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "rateLimited" INTEGER NOT NULL DEFAULT 0,
    "timeout" INTEGER NOT NULL DEFAULT 0,
    "fallbackEvents" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorClass" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastRequestAt" TIMESTAMP(3),
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectChannelAssignment_publishingChannelId_idx" ON "ProjectChannelAssignment"("publishingChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChannelAssignment_projectId_publishingChannelId_key" ON "ProjectChannelAssignment"("projectId", "publishingChannelId");

-- CreateIndex
CREATE INDEX "ProviderUsage_group_idx" ON "ProviderUsage"("group");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUsage_group_provider_key" ON "ProviderUsage"("group", "provider");

-- AddForeignKey
ALTER TABLE "ProjectChannelAssignment" ADD CONSTRAINT "ProjectChannelAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChannelAssignment" ADD CONSTRAINT "ProjectChannelAssignment_publishingChannelId_fkey" FOREIGN KEY ("publishingChannelId") REFERENCES "PublishingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
