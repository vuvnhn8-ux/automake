import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@avf/database';
import {
  ChannelPlatformSchema,
  KnowledgeTypeSchema,
  TopicSourceSchema,
  ContentRulesSchema,
  selectTopic,
} from '@avf/shared';
import { createAIProvider, completeJson, buildTopicSuggestionPrompt, GeneratedTopicsSchema } from '@avf/ai';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import { getChannel, getSeries, getKnowledge, getSeriesTopic } from '../lib/access.js';
import { createContentRecord, enqueueContentGeneration } from '../services/pipeline.js';

const CreateChannelSchema = z.object({
  name: z.string().min(1).max(200),
  platform: ChannelPlatformSchema.default('FACEBOOK'),
  description: z.string().max(2000).optional(),
  dailyVideoTarget: z.number().int().min(0).max(100).default(1),
  autoGenerationEnabled: z.boolean().default(false),
  isActive: z.boolean().default(true),
  facebookPageId: z.string().uuid().nullable().optional(),
  publishingAccountId: z.string().uuid().nullable().optional(),
});

const UpdateChannelSchema = CreateChannelSchema.partial();

const UpsertProfileSchema = z.object({
  description: z.string().max(5000).optional(),
  audience: z.string().max(2000).optional(),
  language: z.string().min(2).max(16).default('vi-VN'),
  tone: z.string().max(100).default('PROFESSIONAL'),
  contentStyle: z.string().max(2000).optional(),
  videoStyle: z.string().max(2000).optional(),
  defaultDurationSeconds: z.number().int().min(5).max(600).optional(),
  defaultTemplate: z.string().max(200).optional(),
  aiInstructions: z.string().max(10000).optional(),
  contentRules: ContentRulesSchema.optional(),
  excludedTopics: z.array(z.string().max(200)).max(200).default([]),
  keywords: z.array(z.string().max(200)).max(200).default([]),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
  cta: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
});

const CreateSeriesSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  instructions: z.string().max(10000).optional(),
  keywords: z.array(z.string().max(200)).max(200).default([]),
  excludedTopics: z.array(z.string().max(200)).max(200).default([]),
  language: z.string().min(2).max(16).optional(),
  tone: z.string().max(100).optional(),
  durationSeconds: z.number().int().min(5).max(600).optional(),
  frequencyPerDay: z.number().int().min(0).max(100).default(1),
  priority: z.number().int().min(0).max(100).default(1),
  isActive: z.boolean().default(true),
});

const UpdateSeriesSchema = CreateSeriesSchema.partial();

const CreateSeriesTopicSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  keywords: z.array(z.string().min(1).max(100)).max(50).default([]),
  frequencyPerDay: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().default(true),
});

const CreateKnowledgeSchema = z.object({
  type: KnowledgeTypeSchema.default('TEXT'),
  title: z.string().min(1).max(200),
  content: z.string().max(20000).optional(),
  fileKey: z.string().max(500).optional(),
  fileName: z.string().max(500).optional(),
  mimeType: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

const GenerateSchema = z.object({
  seriesId: z.string().uuid().optional(),
  topicIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  count: z.number().int().min(1).max(20).default(1),
});

const GenerateTopicSchema = z.object({
  seriesId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(20).default(10),
  language: z.string().min(2).max(16).optional(),
});

const channelDetailInclude = {
  contentProfile: true,
  facebookPage: { select: { id: true, pageId: true, pageName: true } },
  publishingAccount: { select: { id: true, accountName: true, platform: true, status: true } },
  assignments: {
    orderBy: { priority: 'asc' as const },
    include: { campaign: { select: { id: true, name: true, status: true } } },
  },
  publishingJobs: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, status: true, publishedAt: true },
  },
  _count: { select: { series: true, knowledge: true, contents: true } },
} as const;

const seriesInclude = {
  _count: { select: { topics: true, contents: true, schedules: true } },
} as const;

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  const container = app.container;

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  // Cross-project listing (all channels across the user's projects).
  app.get('/channels', async (request) => {
    const auth = getAuthUser(request);
    const channels = await prisma.publishingChannel.findMany({
      where: { project: { userId: auth.id } },
      orderBy: { createdAt: 'asc' },
      include: {
        project: { select: { id: true, name: true } },
        publishingAccount: { select: { id: true, accountName: true, platform: true, status: true } },
        _count: { select: { series: true, knowledge: true, contents: true } },
      },
    });
    return { channels };
  });

  app.get('/projects/:projectId/channels', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const channels = await prisma.publishingChannel.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: channelDetailInclude,
    });
    return { channels };
  });

  app.post('/projects/:projectId/channels', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const body = parse(CreateChannelSchema, request.body);
    const { facebookPageId, publishingAccountId, ...rest } = body;
    if (facebookPageId) {
      const page = await prisma.facebookPage.findFirst({ where: { id: facebookPageId, userId: auth.id } });
      if (!page) {
        return reply.code(404).send({ error: 'not_found', message: 'Facebook page not found' });
      }
    }
    if (publishingAccountId) {
      const account = await prisma.publishingAccount.findFirst({
        where: { id: publishingAccountId, projectId, project: { userId: auth.id } },
      });
      if (!account) {
        return reply.code(404).send({ error: 'not_found', message: 'Publishing account not found' });
      }
    }
    const channel = await prisma.publishingChannel.create({
      data: {
        projectId,
        ...rest,
        ...(facebookPageId ? { facebookPageId } : {}),
        ...(publishingAccountId ? { publishingAccountId } : {}),
      },
      include: channelDetailInclude,
    });
    return reply.code(201).send({ channel });
  });

  app.get('/channels/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const channel = await prisma.publishingChannel.findFirst({
      where: { id, project: { userId: auth.id } },
      include: {
        contentProfile: true,
        series: { orderBy: { priority: 'asc' as const }, include: seriesInclude },
        knowledge: { where: { isActive: true }, orderBy: { createdAt: 'desc' as const } },
        _count: { select: { contents: true, schedules: true } },
      },
    });
    if (!channel) {
      return reply.code(404).send({ error: 'not_found', message: 'Channel not found' });
    }
    return { channel };
  });

  app.patch('/channels/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const body = parse(UpdateChannelSchema, request.body);
    const { facebookPageId, publishingAccountId, ...rest } = body;
    if (facebookPageId) {
      const page = await prisma.facebookPage.findFirst({ where: { id: facebookPageId, userId: auth.id } });
      if (!page) {
        return reply.code(404).send({ error: 'not_found', message: 'Facebook page not found' });
      }
    }
    if (publishingAccountId) {
      const account = await prisma.publishingAccount.findFirst({
        where: { id: publishingAccountId, project: { userId: auth.id } },
      });
      if (!account) {
        return reply.code(404).send({ error: 'not_found', message: 'Publishing account not found' });
      }
    }
    const data: Prisma.PublishingChannelUpdateInput = {
      ...rest,
      ...(body.facebookPageId !== undefined ? { facebookPage: facebookPageId ? { connect: { id: facebookPageId } } : { disconnect: true } } : {}),
      ...(body.publishingAccountId !== undefined ? { publishingAccount: publishingAccountId ? { connect: { id: publishingAccountId } } : { disconnect: true } } : {}),
    };
    const channel = await prisma.publishingChannel.update({ where: { id }, data, include: channelDetailInclude });
    return { channel };
  });

  app.delete('/channels/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    await prisma.publishingChannel.delete({ where: { id } });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Channel content profile
  // -------------------------------------------------------------------------

  app.get('/channels/:id/content-profile', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const profile = await prisma.channelContentProfile.findUnique({ where: { channelId: id } });
    if (!profile) {
      return reply.code(404).send({ error: 'not_found', message: 'Content profile not found' });
    }
    return { profile };
  });

  app.put('/channels/:id/content-profile', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const body = parse(UpsertProfileSchema, request.body);
    const contentRules = body.contentRules as Prisma.InputJsonValue | undefined;
    const profile = await prisma.channelContentProfile.upsert({
      where: { channelId: id },
      update: { ...body, contentRules },
      create: { channelId: id, ...body, contentRules },
    });
    return { profile };
  });

  // -------------------------------------------------------------------------
  // Series
  // -------------------------------------------------------------------------

  app.get('/channels/:id/series', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const series = await prisma.contentSeries.findMany({
      where: { channelId: id },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: seriesInclude,
    });
    return { series };
  });

  app.post('/channels/:id/series', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const body = parse(CreateSeriesSchema, request.body);
    const series = await prisma.contentSeries.create({
      data: { channelId: id, ...body },
      include: seriesInclude,
    });
    return reply.code(201).send({ series });
  });

  app.get('/series/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const series = await prisma.contentSeries.findFirst({
      where: { id, channel: { project: { userId: auth.id } } },
      include: {
        ...seriesInclude,
        topics: { where: { isActive: true }, orderBy: { createdAt: 'desc' as const } },
        channel: { select: { id: true, name: true, platform: true } },
      },
    });
    if (!series) {
      return reply.code(404).send({ error: 'not_found', message: 'Series not found' });
    }
    return { series };
  });

  app.patch('/series/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getSeries(auth.id, id);
    const body = parse(UpdateSeriesSchema, request.body);
    const series = await prisma.contentSeries.update({ where: { id }, data: body, include: seriesInclude });
    return { series };
  });

  app.delete('/series/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getSeries(auth.id, id);
    await prisma.contentSeries.delete({ where: { id } });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Series topics
  // -------------------------------------------------------------------------

  app.get('/series/:id/topics', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getSeries(auth.id, id);
    const topics = await prisma.topic.findMany({
      where: { seriesId: id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contents: true } } },
    });
    return { topics };
  });

  app.post('/series/:id/topics', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const series = await getSeries(auth.id, id);
    const body = parse(CreateSeriesTopicSchema, request.body);
    const topic = await prisma.topic.create({
      data: {
        projectId: series.channel?.projectId ?? series.campaign?.projectId ?? '',
        seriesId: id,
        ...body,
        source: TopicSourceSchema.enum.MANUAL,
      },
    });
    return reply.code(201).send({ topic });
  });

  app.post('/series/:id/topics/:topicId/use', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const topicId = parseId((request.params as { topicId: string }).topicId);
    const topic = await getSeriesTopic(auth.id, id, topicId);
    const updated = await prisma.topic.update({
      where: { id: topic.id },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    return { topic: updated };
  });

  // -------------------------------------------------------------------------
  // Knowledge base
  // -------------------------------------------------------------------------

  app.get('/channels/:id/knowledge', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const knowledge = await prisma.channelKnowledge.findMany({
      where: { channelId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { knowledge };
  });

  app.post('/channels/:id/knowledge', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const body = parse(CreateKnowledgeSchema, request.body);
    const knowledge = await prisma.channelKnowledge.create({
      data: { channelId: id, ...body },
    });
    return reply.code(201).send({ knowledge });
  });

  app.delete('/knowledge/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getKnowledge(auth.id, id);
    await prisma.channelKnowledge.delete({ where: { id } });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Channel-level content generation
  // -------------------------------------------------------------------------

  app.post('/channels/:id/generate', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const channel = await getChannel(auth.id, id);
    const body = parse(GenerateSchema, request.body);

    let seriesId = body.seriesId;
    if (seriesId) await getSeries(auth.id, seriesId);
    if (!seriesId) {
      const firstSeries = await prisma.contentSeries.findFirst({
        where: { channelId: id, isActive: true },
        orderBy: { priority: 'asc' },
      });
      seriesId = firstSeries?.id ?? undefined;
    }

    let topics = body.topicIds?.length
      ? await prisma.topic.findMany({ where: { id: { in: body.topicIds }, seriesId: seriesId ?? undefined } })
      : await prisma.topic.findMany({
          where: { seriesId: seriesId ?? undefined, isActive: true },
        });

    const picked: { topicId: string }[] = [];
    const candidates = [...topics];
    const now = new Date();
    const count = body.count ?? 1;
    for (let i = 0; i < count; i++) {
      const selection = selectTopic(candidates, { now });
      if (!selection) break;
      picked.push({ topicId: selection.topic.id });
      candidates.splice(candidates.findIndex((t) => t.id === selection.topic.id), 1);
    }

    if (picked.length === 0) {
      return reply.code(400).send({ error: 'no_topics', message: 'No active topics available in the series' });
    }

    const results = [];
    for (const item of picked) {
      const contentId = await createContentRecord(auth.id, channel.projectId, {
        topicId: item.topicId,
        channelId: id,
        seriesId,
        title: undefined,
      });
      await enqueueContentGeneration(container.queue, {
        contentId,
        projectId: channel.projectId,
        topicId: item.topicId,
        channelId: id,
        seriesId,
      });
      await prisma.topic.update({
        where: { id: item.topicId },
        data: { usedCount: { increment: 1 }, lastUsedAt: now },
      });
      results.push(contentId);
    }

    return reply.code(201).send({ contentIds: results, count: results.length });
  });

  app.post('/channels/:id/generate-topic', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const channel = await getChannel(auth.id, id);
    const body = parse(GenerateTopicSchema, request.body);

    let seriesId = body.seriesId;
    if (seriesId) await getSeries(auth.id, seriesId);
    if (!seriesId) {
      const firstSeries = await prisma.contentSeries.findFirst({
        where: { channelId: id, isActive: true },
        orderBy: { priority: 'asc' },
      });
      seriesId = firstSeries?.id ?? undefined;
    }
    if (!seriesId) {
      return reply.code(400).send({ error: 'no_series', message: 'Create a series before generating topics' });
    }

    const [profile, series, existingTopics, previousContent] = await Promise.all([
      prisma.channelContentProfile.findUnique({ where: { channelId: id } }),
      prisma.contentSeries.findUnique({ where: { id: seriesId } }),
      prisma.topic.findMany({ where: { seriesId }, select: { name: true } }),
      prisma.content.findMany({
        where: { channelId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { title: true, topic: { select: { name: true } } },
      }),
    ]);

    const ai = createAIProvider();
    const { system, user } = buildTopicSuggestionPrompt({
      channel: profile
        ? { ...profile, contentRules: (profile.contentRules ?? undefined) as Record<string, unknown> | undefined }
        : undefined,
      series: series ?? undefined,
      existingTopics: existingTopics.map((t) => t.name),
      previousContent: previousContent.map((c) => ({
        title: c.title ?? undefined,
        topic: c.topic?.name ?? undefined,
      })),
      count: body.count,
      language: body.language,
    });

    const { data } = await completeJson(ai, system, user, GeneratedTopicsSchema, {
      requestId: `channel:${id}:topics`,
    });

    const existing = existingTopics.map((t) => t.name);
    const created: string[] = [];
    const skippedDuplicates: string[] = [];
    for (const candidate of data.topics) {
      const dup = existing.some((e) => candidate.title.toLowerCase() === e.toLowerCase());
      if (dup) {
        skippedDuplicates.push(candidate.title);
        continue;
      }
      const topic = await prisma.topic.create({
        data: {
          projectId: channel.projectId,
          seriesId,
          name: candidate.title,
          description: candidate.description,
          keywords: candidate.keywords,
          source: 'AI',
        },
      });
      created.push(topic.id);
      existing.push(candidate.title);
    }

    return reply.code(201).send({ created, skippedDuplicates, count: created.length });
  });

  // -------------------------------------------------------------------------
  // Content calendar
  // -------------------------------------------------------------------------

  app.get('/channels/:id/calendar', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getChannel(auth.id, id);
    const query = request.query as { from?: string; to?: string };
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = query.to ? new Date(query.to) : new Date(Date.now() + 30 * 24 * 3600 * 1000);

    const [contents, publishingJobs] = await Promise.all([
      prisma.content.findMany({
        where: { channelId: id, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
        include: {
          topic: { select: { id: true, name: true } },
          series: { select: { id: true, name: true } },
          video: { select: { id: true, status: true } },
        },
      }),
      prisma.publishingJob.findMany({
        where: { channelId: id, scheduledAt: { gte: from, lte: to } },
        orderBy: { scheduledAt: 'asc' },
        include: { video: { select: { id: true, content: { select: { id: true, title: true } } } } },
      }),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      contents,
      publishingJobs,
    };
  });
}
