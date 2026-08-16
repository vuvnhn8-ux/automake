-- Worker fleet heartbeat table (hybrid deployment health visibility).
-- Additive only: creates a new enum and a new table, no changes to existing data.

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DRAINING');

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ONLINE',
    "currentJob" TEXT,
    "version" TEXT,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "ffmpegAvailable" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_lastSeenAt_idx" ON "WorkerHeartbeat"("lastSeenAt");

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_status_idx" ON "WorkerHeartbeat"("status");
