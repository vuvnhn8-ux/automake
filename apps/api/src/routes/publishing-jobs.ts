import type { FastifyInstance } from 'fastify';
import { prisma } from '@avf/database';
import { getAuthUser } from '../plugins/auth.js';
import { parseId } from '../lib/validate.js';

const JOB_LIMIT = 200;

/**
 * Publishing job monitor. One row per PublishingJob, joined to the video's
 * content title and project, plus channel/platform for the destination.
 *
 * Statuses come straight from the PublishingStatus enum (PENDING/UPLOADING/
 * PROCESSING/PUBLISHED/FAILED/CANCELLED). For the job monitor UI we also
 * expose `phase` (QUEUED | SCHEDULED | PUBLISHING | PUBLISHED | FAILED |
 * CANCELLED) and `videoStatus` so generation/render states are visible.
 */
export async function publishingJobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/publishing-jobs', async (request) => {
    const auth = getAuthUser(request);
    const q = request.query as Record<string, string | undefined>;

    const projectId = q.projectId ? parseId(q.projectId) : undefined;
    const channelId = q.channelId ? parseId(q.channelId) : undefined;
    const status = q.status;
    const platform = q.platform;
    const limit = Math.min(Number(q.limit) || 50, JOB_LIMIT);
    const offset = Math.max(Number(q.offset) || 0, 0);

    let dateFilter: { gte?: Date; lte?: Date } = {};
    if (q.from) dateFilter.gte = new Date(q.from);
    if (q.to) dateFilter.lte = new Date(q.to);

    const where = {
      video: {
        project: {
          userId: auth.id,
          ...(projectId ? { id: projectId } : {}),
        },
      },
      ...(channelId ? { channelId } : {}),
      ...(status && status !== 'ALL' ? { status: status as never } : {}),
      ...(platform && platform !== 'ALL' ? { channel: { platform: platform as never } } : {}),
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
    };

    const [jobs, count, today, publishedToday, scheduledCount, processingCount, failedToday, retryingCount] =
      await Promise.all([
        prisma.publishingJob.findMany({
          where,
          orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
          include: {
            video: {
              select: {
                id: true,
                title: true,
                status: true,
                publishedAt: true,
                project: { select: { id: true, name: true } },
                content: { select: { id: true, title: true } },
              },
            },
            channel: { select: { id: true, name: true, platform: true } },
            facebookPage: { select: { id: true, pageName: true } },
          },
        }),
        prisma.publishingJob.count({ where }),
        prisma.publishingJob.count({
          where: { video: { project: { userId: auth.id } }, createdAt: { gte: startOfDay() } },
        }),
        prisma.publishingJob.count({
          where: {
            video: { project: { userId: auth.id } },
            status: 'PUBLISHED',
            publishedAt: { gte: startOfDay() },
          },
        }),
        prisma.publishingJob.count({
          where: { video: { project: { userId: auth.id } }, status: 'PENDING', scheduledAt: { not: null } },
        }),
        prisma.publishingJob.count({
          where: { video: { project: { userId: auth.id } }, status: { in: ['UPLOADING', 'PROCESSING'] } },
        }),
        prisma.publishingJob.count({
          where: {
            video: { project: { userId: auth.id } },
            status: 'FAILED',
            updatedAt: { gte: startOfDay() },
          },
        }),
        prisma.publishingJob.count({
          where: { video: { project: { userId: auth.id } }, status: 'FAILED', retryCount: { gt: 0 } },
        }),
      ]);

    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        phase: phaseOf(j.status, j.scheduledAt),
        retryCount: j.retryCount,
        scheduledAt: j.scheduledAt,
        publishedAt: j.publishedAt,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        errorMessage: j.errorMessage,
        facebookPostId: j.facebookPostId,
        descriptionOverride: j.descriptionOverride,
        videoId: j.videoId,
        videoTitle: j.video?.content?.title ?? j.video?.title ?? null,
        videoStatus: j.video?.status ?? null,
        projectId: j.video?.project?.id ?? null,
        projectName: j.video?.project?.name ?? null,
        channelName: j.channel?.name ?? j.facebookPage?.pageName ?? null,
        platform: j.channel?.platform ?? 'FACEBOOK',
      })),
      count,
      summary: {
        jobsToday: today,
        publishedToday,
        scheduled: scheduledCount,
        processing: processingCount,
        failedToday,
        retrying: retryingCount,
      },
    };
  });

  app.get('/publishing-jobs/projects', async (request) => {
    const auth = getAuthUser(request);
    return {
      projects: await prisma.project.findMany({
        where: { userId: auth.id, isArchived: false },
        select: { id: true, name: true },
        orderBy: { createdAt: 'desc' },
      }),
    };
  });
}

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function phaseOf(status: string, scheduledAt: Date | null): string {
  switch (status) {
    case 'PENDING':
      return scheduledAt ? 'SCHEDULED' : 'QUEUED';
    case 'UPLOADING':
    case 'PROCESSING':
      return 'PUBLISHING';
    case 'PUBLISHED':
      return 'PUBLISHED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return status;
  }
}
