import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { PublishingModeSchema, VideoTemplateSchema } from '@avf/shared';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import { channelOwnershipWhere } from '../lib/channels.js';
import { mergeProjectConfig } from '../lib/project-config.js';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  language: z.string().min(2).max(16).optional(),
  category: z.string().max(100).nullable().optional(),
  defaultTemplate: VideoTemplateSchema.optional(),
  defaultVoice: z.string().max(100).nullable().optional(),
  defaultAIProvider: z.string().max(100).nullable().optional(),
  defaultImageProvider: z.string().max(100).nullable().optional(),
  defaultVideoProvider: z.string().max(100).nullable().optional(),
  defaultVoiceProvider: z.string().max(100).nullable().optional(),
  defaultDurationSeconds: z.number().int().min(10).max(600).optional(),
  publishingMode: PublishingModeSchema.optional(),
  dailyVideoTarget: z.number().int().min(1).max(100).optional(),
  timezone: z.string().max(64).optional(),
});

const UpdateProjectSchema = CreateProjectSchema.partial();

const ProjectConfigSchema = z.object({
  // Content
  contentTheme: z.string().max(2000).optional(),
  keywords: z.array(z.string()).optional(),
  contentInstructions: z.string().max(5000).optional(),
  avoid: z.string().max(5000).optional(),
  targetAudience: z.string().max(2000).optional(),
  // Language
  contentLanguage: z.string().max(16).optional(),
  voiceLanguage: z.string().max(16).optional(),
  languageVariants: z.array(z.string()).optional(),
  // Visual
  visualStyle: z.string().max(500).optional(),
  imageStyle: z.string().max(500).optional(),
  videoStyle: z.string().max(500).optional(),
  aspectRatio: z.string().max(20).optional(),
  resolution: z.string().max(20).optional(),
  durationTarget: z.number().int().min(10).max(600).optional(),
  subtitleStyle: z.string().max(500).optional(),
  // Voice
  voiceProvider: z.string().max(100).optional(),
  voice: z.string().max(100).optional(),
  voiceGender: z.string().max(20).optional(),
  voiceSpeed: z.number().min(0.1).max(3).optional(),
  voiceTone: z.string().max(100).optional(),
  // AI
  scriptProvider: z.string().max(100).optional(),
  imageProvider: z.string().max(100).optional(),
  videoProvider: z.string().max(100).optional(),
  voiceProviderAI: z.string().max(100).optional(),
  fallbackProviders: z.array(z.string()).optional(),
  // Schedule
  schedule: z
    .object({
      times: z.array(z.string()).max(10).optional(),
      days: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      randomizationWindowMin: z.number().int().min(0).max(180).optional(),
    })
    .optional(),
  // Notifications
  notifyOnFailure: z.boolean().optional(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request) => {
    const auth = getAuthUser(request);
    const projects = await prisma.project.findMany({
      where: { userId: auth.id, isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { topics: true, videos: true, contents: true, schedules: true, channelAssignments: true } },
        schedules: {
          where: { status: 'ACTIVE' },
          select: { nextRunAt: true },
          orderBy: { nextRunAt: 'asc' },
          take: 1,
        },
      },
    });
    return {
      projects: projects.map(({ schedules, ...p }) => ({
        ...p,
        nextRunAt: schedules[0]?.nextRunAt ?? null,
      })),
    };
  });

  app.post('/', async (request, reply) => {
    const auth = getAuthUser(request);
    const body = parse(CreateProjectSchema, request.body);
    const project = await prisma.project.create({
      data: { userId: auth.id, ...body },
    });
    return reply.code(201).send({ project });
  });

  app.get('/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const project = await prisma.project.findFirst({
      where: { id, userId: auth.id },
      include: {
        facebookPage: { select: { id: true, pageId: true, pageName: true, status: true } },
        channelAssignments: {
          include: {
            channel: {
              include: {
                project: { select: { id: true, name: true } },
                publishingAccount: { select: { id: true, accountName: true, platform: true } },
              },
            },
          },
          orderBy: { priority: 'asc' },
        },
        schedules: {
          where: { status: 'ACTIVE' },
          select: { nextRunAt: true },
          orderBy: { nextRunAt: 'asc' },
          take: 1,
        },
        _count: { select: { topics: true, videos: true, contents: true, schedules: true, channelAssignments: true } },
      },
    });
    if (!project) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    const nextRunAt =
      project.schedules.length > 0
        ? project.schedules[0]!.nextRunAt
        : null;
    return { project: { ...project, nextRunAt } };
  });

  app.patch('/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(UpdateProjectSchema, request.body);

    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }

    const project = await prisma.project.update({ where: { id }, data: body });
    return { project };
  });

  app.put('/:id/config', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(ProjectConfigSchema, request.body);

    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }

    // Merge patch into existing config so Content/Video/AI sections never wipe each other.
    const merged = mergeProjectConfig(existing.config, body as Record<string, unknown>);
    const project = await prisma.project.update({
      where: { id },
      data: { config: merged as object },
    });
    return { project };
  });

  app.post('/:id/activate', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    const project = await prisma.project.update({ where: { id }, data: { status: 'ACTIVE' } });
    return { project };
  });

  app.post('/:id/pause', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    const project = await prisma.project.update({ where: { id }, data: { status: 'PAUSED' } });
    return { project };
  });

  app.get('/:id/channel-assignments', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    const assignments = await prisma.projectChannelAssignment.findMany({
      where: { projectId: id },
      include: {
        channel: { include: { publishingAccount: { select: { accountName: true, platform: true } } } },
      },
      orderBy: [{ enabled: 'desc' }, { priority: 'asc' }],
    });
    return { assignments };
  });

  app.put('/:id/channel-assignments', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const schema = z.object({
      assignments: z.array(
        z.object({
          publishingChannelId: z.string().uuid(),
          enabled: z.boolean().optional(),
          priority: z.number().int().min(1).max(100).optional(),
          captionFormat: z.string().max(2000).optional(),
          hashtags: z.array(z.string()).optional(),
          titleFormat: z.string().max(500).optional(),
          descriptionTemplate: z.string().max(2000).optional(),
        }),
      ),
    });
    const body = parse(schema, request.body);

    const project = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!project) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }

    const channelIds = body.assignments.map((a) => a.publishingChannelId);
    const channels = await prisma.publishingChannel.findMany({
      where: { id: { in: channelIds }, ...channelOwnershipWhere(auth.id) },
    });
    if (channels.length !== channelIds.length) {
      return reply.code(403).send({ error: 'forbidden', message: 'Channel not in your channel registry' });
    }

    await prisma.$transaction([
      prisma.projectChannelAssignment.deleteMany({ where: { projectId: id } }),
      ...body.assignments.map((a) =>
        prisma.projectChannelAssignment.create({
          data: {
            projectId: id,
            publishingChannelId: a.publishingChannelId,
            enabled: a.enabled ?? true,
            priority: a.priority ?? 1,
            captionFormat: a.captionFormat,
            hashtags: a.hashtags,
            titleFormat: a.titleFormat,
            descriptionTemplate: a.descriptionTemplate,
          },
        }),
      ),
    ]);

    const assignments = await prisma.projectChannelAssignment.findMany({
      where: { projectId: id },
      include: {
        channel: { include: { publishingAccount: { select: { accountName: true, platform: true } } } },
      },
      orderBy: [{ enabled: 'desc' }, { priority: 'asc' }],
    });
    return { assignments };
  });

  app.delete('/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    await prisma.project.delete({ where: { id } });
    return reply.code(204).send();
  });
}
