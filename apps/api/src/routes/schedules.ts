import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { nextRunTime, formatRunDelayMs } from '@avf/shared';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import { getChannel, getSeries } from '../lib/access.js';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

const validTimezone = (v: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
};

const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(10),
  days: z.array(z.enum(DAYS)).max(7).default([]),
  timezone: z.string().max(64).refine(validTimezone, 'Invalid IANA timezone').default('Asia/Tokyo'),
  topicId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  seriesId: z.string().uuid().optional(),
});

const UpdateScheduleSchema = CreateScheduleSchema.partial();

// helper signature kept simple for both routes and worker
export async function scheduleRunDelay(
  queue: { add(jobName: string, payload: Record<string, unknown>, opts?: { delayMs?: number; jobId?: string }): Promise<string> },
  scheduleId: string,
  projectId: string,
): Promise<void> {
  const schedule = await prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } });
  if (schedule.status !== 'ACTIVE') return;
  const next = nextRunTime(schedule.times, schedule.days, new Date(), schedule.timezone || undefined);
  if (!next) return;
  const delayMs = formatRunDelayMs(next);
  await prisma.schedule.update({ where: { id: scheduleId }, data: { nextRunAt: next } });
  await queue.add('scheduled-run', {
    scheduleId,
    projectId,
    runAt: next.toISOString(),
  }, { delayMs, jobId: `scheduled-run:${scheduleId}:${next.toISOString()}` });
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  const container = app.container;

  app.get('/projects/:projectId/schedules', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const schedules = await prisma.schedule.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        topic: { select: { id: true, name: true } },
        channel: { select: { id: true, name: true, platform: true } },
      },
    });
    return { schedules };
  });

  app.post('/projects/:projectId/schedules', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const body = parse(CreateScheduleSchema, request.body);

    if (body.campaignId) {
      await prisma.contentCampaign.findFirstOrThrow({
        where: { id: body.campaignId, projectId, project: { userId: auth.id } },
      });
    }
    if (body.channelId) await getChannel(auth.id, body.channelId);
    if (body.seriesId) await getSeries(auth.id, body.seriesId);

    const schedule = await prisma.schedule.create({
      data: {
        projectId,
        name: body.name ?? 'Untitled schedule',
        times: body.times,
        days: body.days,
        timezone: body.timezone,
        topicId: body.topicId ?? null,
        campaignId: body.campaignId ?? null,
        channelId: body.channelId ?? null,
        seriesId: body.seriesId ?? null,
      },
    });
    await scheduleRunDelay(container.queue, schedule.id, projectId);
    return reply.code(201).send({ schedule });
  });

  app.patch('/schedules/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(UpdateScheduleSchema, request.body);

    const schedule = await prisma.schedule.findFirst({ where: { id } });
    if (!schedule) {
      return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: schedule.projectId, userId: auth.id } });

    const updated = await prisma.schedule.update({ where: { id }, data: body });
    // Re-enqueue next run with new times (idempotent via jobId on the worker side).
    await scheduleRunDelay(container.queue, id, schedule.projectId);
    return { schedule: updated };
  });

  app.delete('/schedules/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const schedule = await prisma.schedule.findFirst({ where: { id } });
    if (!schedule) {
      return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: schedule.projectId, userId: auth.id } });
    await prisma.schedule.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post('/schedules/:id/pause', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const schedule = await prisma.schedule.findFirst({ where: { id } });
    if (!schedule) {
      return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: schedule.projectId, userId: auth.id } });
    const updated = await prisma.schedule.update({ where: { id }, data: { status: 'PAUSED', nextRunAt: null } });
    return { schedule: updated };
  });

  app.post('/schedules/:id/resume', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const schedule = await prisma.schedule.findFirst({ where: { id } });
    if (!schedule) {
      return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: schedule.projectId, userId: auth.id } });
    const updated = await prisma.schedule.update({ where: { id }, data: { status: 'ACTIVE' } });
    await scheduleRunDelay(container.queue, id, schedule.projectId);
    return { schedule: updated };
  });
}
