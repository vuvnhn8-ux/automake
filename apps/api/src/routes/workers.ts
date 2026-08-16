import type { FastifyInstance } from 'fastify';
import { prisma } from '@avf/database';
import { getAuthUser } from '../plugins/auth.js';

/**
 * Online threshold: a worker is considered online when its last heartbeat is
 * within 3x the default WORKER_HEARTBEAT_INTERVAL_MS (15s default → 45s).
 */
const ONLINE_THRESHOLD_MS = 45_000;

export async function workerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workers', async (request) => {
    getAuthUser(request);
    const threshold = new Date(Date.now() - ONLINE_THRESHOLD_MS);
    const workers = await prisma.workerHeartbeat.findMany({
      orderBy: { lastSeenAt: 'desc' },
    });
    return {
      onlineThresholdMs: ONLINE_THRESHOLD_MS,
      workers: workers.map((w) => ({
        workerId: w.workerId,
        hostname: w.hostname,
        status: w.status,
        currentJob: w.currentJob,
        version: w.version,
        concurrency: w.concurrency,
        ffmpegAvailable: w.ffmpegAvailable,
        lastSeenAt: w.lastSeenAt,
        online: w.lastSeenAt >= threshold,
      })),
    };
  });
}
