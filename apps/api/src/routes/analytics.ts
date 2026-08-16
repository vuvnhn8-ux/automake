import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { AnalyticsMetricSchema } from '@avf/shared';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects/:projectId/analytics', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    const query = parse(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        metric: AnalyticsMetricSchema.optional(),
        videoId: z.string().uuid().optional(),
      }),
      request.query,
    );
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });

    const records = await prisma.analytics.findMany({
      where: {
        projectId,
        ...(query.from ? { recordedAt: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { recordedAt: { lte: new Date(query.to) } } : {}),
        ...(query.metric ? { metric: query.metric } : {}),
        ...(query.videoId ? { videoId: query.videoId } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: 500,
    });
    return { analytics: records };
  });

  app.get('/projects/:projectId/analytics/summary', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });

    const rows = await prisma.analytics.groupBy({
      by: ['metric'],
      where: { projectId },
      _sum: { value: true },
    });
    const summary = Object.fromEntries(
      rows.map((r) => [r.metric, r._sum.value ?? 0]),
    );
    return { summary };
  });

  // Records metric data (used by webhook / manual import).
  app.post('/projects/:projectId/analytics', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    const body = parse(
      z.object({
        records: z
          .array(
            z.object({
              metric: AnalyticsMetricSchema,
              value: z.number().nonnegative(),
              videoId: z.string().uuid().optional(),
              facebookPostId: z.string().optional(),
              recordedAt: z.string().datetime().optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
      request.body,
    );
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });

    const created = await prisma.analytics.createMany({
      data: body.records.map((r) => ({
        projectId,
        metric: r.metric,
        value: r.value,
        videoId: r.videoId ?? null,
        facebookPostId: r.facebookPostId ?? null,
        recordedAt: r.recordedAt ? new Date(r.recordedAt) : new Date(),
      })),
    });
    return reply.code(201).send({ created: created.count });
  });
}
