import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@avf/database';
import {
  CampaignStatusSchema,
  CampaignContentProfileSchema,
  VisualProfileConfigSchema,
  VoiceProfileConfigSchema,
  VideoProfileConfigSchema,
  ProviderOverridesSchema,
  CampaignAutomationSchema,
  KnowledgeTypeSchema,
  ContentRulesSchema,
  TopicSourceSchema,
  selectTopic,
  normalizeCampaign,
  planVariantLanguages,
} from '@avf/shared';
import {
  completeJsonWithPool,
  buildTopicSuggestionPrompt,
  GeneratedTopicsSchema,
  type CampaignProfileInput,
} from '@avf/ai';
import { recordProviderUsage } from '@avf/config';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import {
  getCampaign,
  getCampaignSeries,
  getCampaignKnowledge,
  getProject,
} from '../lib/access.js';
import { createContentRecord, enqueueContentGeneration } from '../services/pipeline.js';

const validTimezone = (v: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
};

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: CampaignStatusSchema.optional(),
  dailyVideoTarget: z.number().int().min(0).max(100).optional(),
  timezone: z.string().max(64).refine(validTimezone, 'Invalid IANA timezone').optional(),
  aiInstructions: z.string().max(20000).optional(),
  contentRules: ContentRulesSchema.optional(),
  contentProfile: CampaignContentProfileSchema.optional(),
  visualProfile: VisualProfileConfigSchema.optional(),
  voiceProfile: VoiceProfileConfigSchema.optional(),
  videoProfile: VideoProfileConfigSchema.optional(),
  providerOverrides: ProviderOverridesSchema.optional(),
  automation: CampaignAutomationSchema.optional(),
});

const UpdateCampaignSchema = CreateCampaignSchema.partial();

const CreateCampaignSeriesSchema = z.object({
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

const CreateCampaignKnowledgeSchema = z.object({
  type: KnowledgeTypeSchema.default('TEXT'),
  title: z.string().min(1).max(200),
  content: z.string().max(20000).optional(),
  fileKey: z.string().max(500).optional(),
  fileName: z.string().max(500).optional(),
  mimeType: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

const AssignmentInputSchema = z.object({
  publishingChannelId: z.string().uuid(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(1),
  languageOverride: z.string().min(2).max(16).nullable().optional(),
  voiceProfileOverride: z.record(z.unknown()).nullable().optional(),
  visualProfileOverride: z.record(z.unknown()).nullable().optional(),
  videoProfileOverride: z.record(z.unknown()).nullable().optional(),
  captionInstructions: z.string().max(5000).nullable().optional(),
  scheduleOverride: z.record(z.unknown()).nullable().optional(),
});

const GenerateCampaignSchema = z.object({
  seriesId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(20).default(1),
});

const GenerateTopicSchema = z.object({
  seriesId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(20).default(10),
  language: z.string().min(2).max(16).optional(),
});

const campaignDetailInclude = {
  assignments: {
    orderBy: { priority: 'asc' as const },
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          platform: true,
          isActive: true,
          facebookPage: { select: { id: true, pageName: true } },
          publishingAccount: { select: { id: true, accountName: true, platform: true } },
        },
      },
    },
  },
  series: { orderBy: { priority: 'asc' as const }, include: { _count: { select: { topics: true, contents: true } } } },
  knowledge: { where: { isActive: true }, orderBy: { createdAt: 'desc' as const } },
  schedules: true,
  _count: { select: { contents: true, videos: true } },
} as const;

const campaignListInclude = {
  _count: { select: { assignments: true, series: true, contents: true } },
} as const;

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  const container = app.container;

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------

  app.get('/projects/:projectId/campaigns', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await getProject(auth.id, projectId);
    const campaigns = await prisma.contentCampaign.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: campaignListInclude,
    });
    return { campaigns };
  });

  app.post('/projects/:projectId/campaigns', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await getProject(auth.id, projectId);
    const body = parse(CreateCampaignSchema, request.body);
    const data: Prisma.ContentCampaignUncheckedCreateInput = {
      projectId,
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.dailyVideoTarget !== undefined ? { dailyVideoTarget: body.dailyVideoTarget } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.aiInstructions !== undefined ? { aiInstructions: body.aiInstructions } : {}),
      ...(body.contentRules !== undefined ? { contentRules: body.contentRules as Prisma.InputJsonValue } : {}),
      ...(body.contentProfile !== undefined ? { contentProfile: body.contentProfile as Prisma.InputJsonValue } : {}),
      ...(body.visualProfile !== undefined ? { visualProfile: body.visualProfile as Prisma.InputJsonValue } : {}),
      ...(body.voiceProfile !== undefined ? { voiceProfile: body.voiceProfile as Prisma.InputJsonValue } : {}),
      ...(body.videoProfile !== undefined ? { videoProfile: body.videoProfile as Prisma.InputJsonValue } : {}),
      ...(body.providerOverrides !== undefined ? { providerOverrides: body.providerOverrides as Prisma.InputJsonValue } : {}),
      ...(body.automation !== undefined ? { automation: body.automation as Prisma.InputJsonValue } : {}),
    };
    const campaign = await prisma.contentCampaign.create({ data });
    return reply.code(201).send({ campaign });
  });

  app.get('/campaigns/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const campaign = await prisma.contentCampaign.findFirst({
      where: { id, project: { userId: auth.id } },
      include: campaignDetailInclude,
    });
    if (!campaign) {
      return reply.code(404).send({ error: 'not_found', message: 'Campaign not found' });
    }
    return { campaign };
  });

  app.patch('/campaigns/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const body = parse(UpdateCampaignSchema, request.body);
    const data: Prisma.ContentCampaignUpdateInput = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.dailyVideoTarget !== undefined ? { dailyVideoTarget: body.dailyVideoTarget } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.aiInstructions !== undefined ? { aiInstructions: body.aiInstructions } : {}),
      ...(body.contentRules !== undefined ? { contentRules: body.contentRules as Prisma.InputJsonValue } : {}),
      ...(body.contentProfile !== undefined ? { contentProfile: body.contentProfile as Prisma.InputJsonValue } : {}),
      ...(body.visualProfile !== undefined ? { visualProfile: body.visualProfile as Prisma.InputJsonValue } : {}),
      ...(body.voiceProfile !== undefined ? { voiceProfile: body.voiceProfile as Prisma.InputJsonValue } : {}),
      ...(body.videoProfile !== undefined ? { videoProfile: body.videoProfile as Prisma.InputJsonValue } : {}),
      ...(body.providerOverrides !== undefined ? { providerOverrides: body.providerOverrides as Prisma.InputJsonValue } : {}),
      ...(body.automation !== undefined ? { automation: body.automation as Prisma.InputJsonValue } : {}),
    };
    const campaign = await prisma.contentCampaign.update({ where: { id }, data });
    return { campaign };
  });

  app.delete('/campaigns/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    await prisma.contentCampaign.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post('/campaigns/:id/activate', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const campaign = await prisma.contentCampaign.update({ where: { id }, data: { status: 'ACTIVE' } });
    return { campaign };
  });

  app.post('/campaigns/:id/pause', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const campaign = await prisma.contentCampaign.update({ where: { id }, data: { status: 'PAUSED' } });
    return { campaign };
  });

  app.post('/campaigns/:id/archive', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const campaign = await prisma.contentCampaign.update({ where: { id }, data: { status: 'ARCHIVED' } });
    return { campaign };
  });

  // -------------------------------------------------------------------------
  // Channel assignments
  // -------------------------------------------------------------------------

  app.get('/campaigns/:id/assignments', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const assignments = await prisma.campaignChannelAssignment.findMany({
      where: { campaignId: id },
      orderBy: { priority: 'asc' },
      include: {
        channel: { select: { id: true, name: true, platform: true, isActive: true } },
      },
    });
    return { assignments };
  });

  app.put('/campaigns/:id/assignments', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const campaign = await getCampaign(auth.id, id);
    const body = parse(
      z.object({ assignments: z.array(AssignmentInputSchema).max(100) }),
      request.body,
    );

    const channelIds = body.assignments.map((a) => a.publishingChannelId);
    const channels = await prisma.publishingChannel.findMany({
      where: { id: { in: channelIds }, projectId: campaign.projectId },
      select: { id: true },
    });
    const owned = new Set(channels.map((c) => c.id));
    const foreign = channelIds.filter((cid) => !owned.has(cid));
    if (foreign.length > 0) {
      return reply.code(403).send({ error: 'forbidden', message: 'One or more channels do not belong to this project' });
    }

    for (const input of body.assignments) {
      await prisma.campaignChannelAssignment.upsert({
        where: {
          campaignId_publishingChannelId: {
            campaignId: id,
            publishingChannelId: input.publishingChannelId,
          },
        },
        update: {
          enabled: input.enabled,
          priority: input.priority,
          languageOverride: input.languageOverride ?? null,
          voiceProfileOverride: input.voiceProfileOverride ? (input.voiceProfileOverride as Prisma.InputJsonValue) : Prisma.DbNull,
          visualProfileOverride: input.visualProfileOverride ? (input.visualProfileOverride as Prisma.InputJsonValue) : Prisma.DbNull,
          videoProfileOverride: input.videoProfileOverride ? (input.videoProfileOverride as Prisma.InputJsonValue) : Prisma.DbNull,
          captionInstructions: input.captionInstructions ?? null,
          scheduleOverride: input.scheduleOverride ? (input.scheduleOverride as Prisma.InputJsonValue) : Prisma.DbNull,
        },
        create: {
          campaignId: id,
          publishingChannelId: input.publishingChannelId,
          enabled: input.enabled,
          priority: input.priority,
          languageOverride: input.languageOverride ?? null,
          voiceProfileOverride: input.voiceProfileOverride ? (input.voiceProfileOverride as Prisma.InputJsonValue) : Prisma.DbNull,
          visualProfileOverride: input.visualProfileOverride ? (input.visualProfileOverride as Prisma.InputJsonValue) : Prisma.DbNull,
          videoProfileOverride: input.videoProfileOverride ? (input.videoProfileOverride as Prisma.InputJsonValue) : Prisma.DbNull,
          captionInstructions: input.captionInstructions ?? null,
          scheduleOverride: input.scheduleOverride ? (input.scheduleOverride as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    }

    await prisma.campaignChannelAssignment.deleteMany({
      where: {
        campaignId: id,
        publishingChannelId: { notIn: channelIds },
      },
    });

    const assignments = await prisma.campaignChannelAssignment.findMany({
      where: { campaignId: id },
      orderBy: { priority: 'asc' },
      include: {
        channel: { select: { id: true, name: true, platform: true, isActive: true } },
      },
    });
    return { assignments };
  });

  // -------------------------------------------------------------------------
  // Campaign series + topics
  // -------------------------------------------------------------------------

  app.get('/campaigns/:id/series', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const series = await prisma.contentSeries.findMany({
      where: { campaignId: id },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { topics: true, contents: true } } },
    });
    return { series };
  });

  app.post('/campaigns/:id/series', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const body = parse(CreateCampaignSeriesSchema, request.body);
    const series = await prisma.contentSeries.create({
      data: { campaignId: id, channelId: null, ...body },
      include: { _count: { select: { topics: true, contents: true } } },
    });
    return reply.code(201).send({ series });
  });

  app.patch('/campaigns/:campaignId/series/:seriesId', async (request, reply) => {
    const auth = getAuthUser(request);
    const campaignId = parseId((request.params as { campaignId: string }).campaignId);
    const seriesId = parseId((request.params as { seriesId: string }).seriesId);
    await getCampaignSeries(auth.id, campaignId, seriesId);
    const body = parse(CreateCampaignSeriesSchema.partial(), request.body);
    const series = await prisma.contentSeries.update({ where: { id: seriesId }, data: body });
    return { series };
  });

  app.delete('/campaigns/:campaignId/series/:seriesId', async (request, reply) => {
    const auth = getAuthUser(request);
    const campaignId = parseId((request.params as { campaignId: string }).campaignId);
    const seriesId = parseId((request.params as { seriesId: string }).seriesId);
    await getCampaignSeries(auth.id, campaignId, seriesId);
    await prisma.contentSeries.delete({ where: { id: seriesId } });
    return reply.code(204).send();
  });

  app.get('/campaigns/:campaignId/series/:seriesId/topics', async (request) => {
    const auth = getAuthUser(request);
    const campaignId = parseId((request.params as { campaignId: string }).campaignId);
    const seriesId = parseId((request.params as { seriesId: string }).seriesId);
    await getCampaignSeries(auth.id, campaignId, seriesId);
    const topics = await prisma.topic.findMany({
      where: { seriesId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contents: true } } },
    });
    return { topics };
  });

  app.post('/campaigns/:campaignId/series/:seriesId/topics', async (request, reply) => {
    const auth = getAuthUser(request);
    const campaignId = parseId((request.params as { campaignId: string }).campaignId);
    const seriesId = parseId((request.params as { seriesId: string }).seriesId);
    const campaign = await getCampaign(auth.id, campaignId);
    await getCampaignSeries(auth.id, campaignId, seriesId);
    const body = parse(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        keywords: z.array(z.string().min(1).max(100)).max(50).default([]),
        frequencyPerDay: z.number().int().min(0).max(100).optional(),
        isActive: z.boolean().default(true),
      }),
      request.body,
    );
    const topic = await prisma.topic.create({
      data: { projectId: campaign.projectId, seriesId, ...body, source: TopicSourceSchema.enum.MANUAL },
    });
    return reply.code(201).send({ topic });
  });

  // -------------------------------------------------------------------------
  // Campaign knowledge (isolated per campaign — never leaks across campaigns)
  // -------------------------------------------------------------------------

  app.get('/campaigns/:id/knowledge', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const knowledge = await prisma.campaignKnowledge.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { knowledge };
  });

  app.post('/campaigns/:id/knowledge', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaign(auth.id, id);
    const body = parse(CreateCampaignKnowledgeSchema, request.body);
    const knowledge = await prisma.campaignKnowledge.create({ data: { campaignId: id, ...body } });
    return reply.code(201).send({ knowledge });
  });

  app.delete('/campaign-knowledge/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getCampaignKnowledge(auth.id, id);
    await prisma.campaignKnowledge.delete({ where: { id } });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // AI topic generation (campaign context)
  // -------------------------------------------------------------------------

  app.post('/campaigns/:id/generate-topic', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const campaign = await getCampaign(auth.id, id);
    const body = parse(GenerateTopicSchema, request.body);

    let seriesId = body.seriesId;
    if (seriesId) await getCampaignSeries(auth.id, id, seriesId);
    if (!seriesId) {
      const first = await prisma.contentSeries.findFirst({
        where: { campaignId: id, isActive: true },
        orderBy: { priority: 'asc' },
      });
      seriesId = first?.id ?? undefined;
    }
    if (!seriesId) {
      return reply.code(400).send({ error: 'no_series', message: 'Create a series before generating topics' });
    }

    const [series, existingTopics, previousContent] = await Promise.all([
      prisma.contentSeries.findUnique({ where: { id: seriesId } }),
      prisma.topic.findMany({ where: { seriesId }, select: { name: true } }),
      prisma.content.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { title: true, topic: { select: { name: true } } },
      }),
    ]);

    const campaignProfile = campaign.contentProfile as CampaignProfileInput | null;
    const { system, user } = buildTopicSuggestionPrompt({
      campaign: campaignProfile ? { ...campaignProfile, aiInstructions: campaign.aiInstructions } : campaign.aiInstructions ? { name: campaign.name, aiInstructions: campaign.aiInstructions } : undefined,
      series: series ?? undefined,
      existingTopics: existingTopics.map((t) => t.name),
      previousContent: previousContent.map((c) => ({
        title: c.title ?? undefined,
        topic: c.topic?.name ?? undefined,
      })),
      count: body.count,
      language: body.language ?? campaignProfile?.language,
    });

    const { data } = await completeJsonWithPool(system, user, GeneratedTopicsSchema, {
      requestId: `campaign:${id}:topics`,
      pool: {
        group: 'AI_TEXT',
        onUsage: (record) => void recordProviderUsage({ ...record }),
      },
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
          projectId: campaign.projectId,
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
  // Manual campaign run: concept + localized variants -> publications
  // -------------------------------------------------------------------------

  app.post('/campaigns/:id/generate', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const campaign = await getCampaign(auth.id, id);
    if (campaign.status === 'ARCHIVED') {
      return reply.code(400).send({ error: 'invalid_state', message: 'Archived campaigns cannot generate content' });
    }
    const body = parse(GenerateCampaignSchema, request.body);

    let seriesId = body.seriesId;
    if (seriesId) await getCampaignSeries(auth.id, id, seriesId);
    if (!seriesId) {
      const first = await prisma.contentSeries.findFirst({
        where: { campaignId: id, isActive: true },
        orderBy: { priority: 'asc' },
      });
      seriesId = first?.id ?? undefined;
    }
    if (!seriesId) {
      return reply.code(400).send({ error: 'no_series', message: 'Create a series before generating content' });
    }

    const topics = await prisma.topic.findMany({ where: { seriesId, isActive: true } });
    const picked: { topicId: string }[] = [];
    const candidates = [...topics];
    const count = body.count ?? 1;
    for (let i = 0; i < count; i++) {
      const selection = selectTopic(candidates);
      if (!selection) break;
      picked.push({ topicId: selection.topic.id });
      candidates.splice(candidates.findIndex((t) => t.id === selection.topic.id), 1);
    }
    if (picked.length === 0) {
      return reply.code(400).send({ error: 'no_topics', message: 'No active topics available in the series' });
    }

    const project = await getProject(auth.id, campaign.projectId);
    const normalized = normalizeCampaign(campaign);
    const baseLanguage = normalized?.contentProfile?.language ?? project.language;
    const assignments = await prisma.campaignChannelAssignment.findMany({
      where: { campaignId: id, enabled: true },
    });
    const assignmentLikes = assignments.map((a) => ({
      languageOverride: a.languageOverride,
      voiceProfileOverride:
        a.voiceProfileOverride && typeof a.voiceProfileOverride === 'object'
          ? (a.voiceProfileOverride as Record<string, unknown>)
          : null,
      visualProfileOverride:
        a.visualProfileOverride && typeof a.visualProfileOverride === 'object'
          ? (a.visualProfileOverride as Record<string, unknown>)
          : null,
      videoProfileOverride:
        a.videoProfileOverride && typeof a.videoProfileOverride === 'object'
          ? (a.videoProfileOverride as Record<string, unknown>)
          : null,
      captionInstructions: a.captionInstructions,
    }));
    const variantLanguages = planVariantLanguages(normalized, assignmentLikes, project.language).filter(
      (l) => l !== baseLanguage,
    );

    const concepts: string[] = [];
    const variants: Record<string, string[]> = {};
    for (const item of picked) {
      const conceptId = await createContentRecord(auth.id, campaign.projectId, {
        campaignId: id,
        seriesId,
        topicId: item.topicId,
        language: baseLanguage,
        title: undefined,
      });
      await enqueueContentGeneration(container.queue, {
        contentId: conceptId,
        projectId: campaign.projectId,
        topicId: item.topicId,
        campaignId: id,
        seriesId,
        language: baseLanguage,
      });
      concepts.push(conceptId);

      for (const lang of variantLanguages) {
        const variantId = await createContentRecord(auth.id, campaign.projectId, {
          campaignId: id,
          seriesId,
          topicId: item.topicId,
          language: lang,
          variantOfContentId: conceptId,
          title: undefined,
        });
        await enqueueContentGeneration(container.queue, {
          contentId: variantId,
          projectId: campaign.projectId,
          topicId: item.topicId,
          campaignId: id,
          seriesId,
          language: lang,
        });
        (variants[lang] ??= []).push(variantId);
      }

      await prisma.topic.update({
        where: { id: item.topicId },
        data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
      });
    }

    return reply.code(201).send({ concepts, variants, count: concepts.length });
  });
}
