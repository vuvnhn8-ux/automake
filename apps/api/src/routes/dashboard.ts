import type { FastifyInstance } from 'fastify';
import { prisma } from '@avf/database';
import { getAuthUser } from '../plugins/auth.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', async (request) => {
    const auth = getAuthUser(request);

    const [totalVideos, publishedVideos, scheduledVideos, failedVideos, projects, topics, pages, activeSchedules] =
      await Promise.all([
        prisma.video.count({ where: { project: { userId: auth.id } } }),
        prisma.video.count({ where: { project: { userId: auth.id }, status: { in: ['READY', 'NEEDS_REVIEW'] } } }),
        prisma.publishingJob.count({ where: { video: { project: { userId: auth.id } }, status: 'PENDING', scheduledAt: { not: null } } }),
        prisma.video.count({ where: { project: { userId: auth.id }, status: 'FAILED' } }),
        prisma.project.count({ where: { userId: auth.id, isArchived: false } }),
        prisma.topic.count({ where: { project: { userId: auth.id }, isActive: true } }),
        prisma.facebookPage.count({ where: { userId: auth.id, status: 'CONNECTED' } }),
        prisma.schedule.count({ where: { project: { userId: auth.id }, status: 'ACTIVE' } }),
      ]);

    const analytics = await prisma.analytics.groupBy({
      by: ['metric'],
      where: { project: { userId: auth.id } },
      _sum: { value: true },
    });
    const engagement = Object.fromEntries(
      analytics.map((a) => [a.metric, a._sum?.value ?? 0]),
    );

    return {
      stats: {
        totalVideos,
        publishedVideos,
        scheduledVideos,
        failedVideos,
        projects,
        topics,
        facebookPages: pages,
        activeSchedules,
      },
      engagement,
    };
  });
}
