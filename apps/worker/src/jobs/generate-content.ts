import { prisma } from '@avf/database';
import { createResearchProvider, completeJsonWithPool, ContentPromptBuilder } from '@avf/ai';
import { getActiveProvider, getProviderSetting, recordProviderUsage, refreshProviderConfig } from '@avf/config';
import type {
  ChannelProfileInput,
  CampaignProfileInput,
  SeriesInput,
  TopicInput,
  KnowledgeInput,
  PreviousContentInput,
} from '@avf/ai';
import { ScriptOutputSchema, type ScriptOutput } from '@avf/shared';
import type { ZodType } from 'zod';
import type { WorkerContext } from '../context.js';
import { recordLog, failContent, shortMessage } from '../lib/status.js';

interface GenerateContentPayload {
  contentId: string;
  projectId: string;
  topicId?: string;
  campaignId?: string;
  channelId?: string;
  seriesId?: string;
  language?: string;
  regenerate?: boolean;
}

interface ChannelGenerationContext {
  channel?: ChannelProfileInput;
  series?: SeriesInput;
  topic?: TopicInput;
  knowledge?: KnowledgeInput[];
  previousContent?: PreviousContentInput[];
  platform?: string;
}

interface CampaignGenerationContext {
  campaign: CampaignProfileInput;
  series?: SeriesInput;
  topic?: TopicInput;
  knowledge?: KnowledgeInput[];
  previousContent?: PreviousContentInput[];
}

/**
 * Generates the script + scene breakdown for a content record, then enqueues
 * the scene-level generation job. Channel-linked content uses the full
 * content-strategy context (profile -> series -> topic -> knowledge ->
 * previous content -> platform rules). Research context is used when the
 * content is linked to a topic and a real research provider is configured.
 */
export async function handleGenerateContent(
  ctx: WorkerContext,
  payload: GenerateContentPayload,
): Promise<void> {
  const started = Date.now();
  const { contentId, projectId } = payload;

  const content = await prisma.content.findFirst({
    where: { id: contentId, projectId },
    include: { project: true, topic: true },
  });
  if (!content) throw new Error('Content not found');

  try {
    const providerOverride = content.campaignId
      ? ((await prisma.contentCampaign.findUnique({
          where: { id: content.campaignId },
          select: { providerOverrides: true },
        }))?.providerOverrides as { ai?: string } | null | undefined)?.ai
      : undefined;
    await refreshProviderConfig();
    const researchActive = getActiveProvider('RESEARCH', process.env.RESEARCH_PROVIDER ?? 'MOCK') === 'TAVILY';
    const researchSetting = getProviderSetting('TAVILY');
    const researchEnabled = researchActive && (researchSetting?.enabled ?? true);

    const topicName = content.topic?.name ?? content.title ?? 'General topic';

    // Campaign-linked generation: gather the campaign content strategy
    // (profile -> campaign series -> topic -> campaign knowledge -> previous
    // campaign content). Campaign knowledge is isolated per campaign.
    let campaignContext: CampaignGenerationContext | undefined;
    if (content.campaignId) {
      const [campaign, knowledge, series, previousContent] = await Promise.all([
        prisma.contentCampaign.findUnique({ where: { id: content.campaignId } }),
        prisma.campaignKnowledge.findMany({
          where: { campaignId: content.campaignId, isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        content.seriesId
          ? prisma.contentSeries.findUnique({ where: { id: content.seriesId } })
          : Promise.resolve(null),
        prisma.content.findMany({
          where: { campaignId: content.campaignId, id: { not: contentId } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { topic: { select: { name: true } } },
        }),
      ]);
      if (campaign) {
        const profile = (campaign.contentProfile ?? {}) as Record<string, unknown>;
        campaignContext = {
          campaign: {
            name: campaign.name,
            description: campaign.description ?? undefined,
            audience: typeof profile.audience === 'string' ? profile.audience : undefined,
            language: typeof profile.language === 'string' ? profile.language : undefined,
            tone: typeof profile.tone === 'string' ? profile.tone : undefined,
            contentStyle: typeof profile.contentStyle === 'string' ? profile.contentStyle : undefined,
            keywords: Array.isArray(profile.keywords) ? (profile.keywords as string[]) : undefined,
            excludedTopics: Array.isArray(profile.excludedTopics) ? (profile.excludedTopics as string[]) : undefined,
            cta: typeof profile.cta === 'string' ? profile.cta : undefined,
            aiInstructions: campaign.aiInstructions ?? undefined,
            contentRules: (campaign.contentRules ?? undefined) as Record<string, unknown> | undefined,
          },
          series: series ?? undefined,
          topic: content.topic ?? undefined,
          knowledge: knowledge.map((k) => ({ title: k.title, content: k.content, url: k.url })),
          previousContent: previousContent.map((c) => ({
            title: c.title,
            topic: c.topic?.name ?? undefined,
            summary: undefined,
          })),
        };
      }
    }

    // Channel-linked generation: gather the full content-strategy context.
    let channelContext: ChannelGenerationContext | undefined;
    if (content.channelId) {
      const [channel, series, knowledge, previousContent] = await Promise.all([
        prisma.publishingChannel.findUnique({ where: { id: content.channelId }, include: { contentProfile: true } }),
        content.seriesId
          ? prisma.contentSeries.findUnique({ where: { id: content.seriesId } })
          : Promise.resolve(null),
        prisma.channelKnowledge.findMany({
          where: { channelId: content.channelId, isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.content.findMany({
          where: { channelId: content.channelId, id: { not: contentId } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { topic: { select: { name: true } } },
        }),
      ]);
      if (channel) {
        channelContext = {
          channel: channel.contentProfile
            ? { ...channel.contentProfile, contentRules: (channel.contentProfile.contentRules ?? undefined) as Record<string, unknown> | undefined }
            : undefined,
          series: series ?? undefined,
          topic: content.topic ?? undefined,
          knowledge: knowledge.map((k) => ({ title: k.title, content: k.content, url: k.url })),
          previousContent: previousContent.map((c) => ({
            title: c.title,
            topic: c.topic?.name ?? undefined,
            summary: undefined,
          })),
          platform: channel.platform,
        };
      }
    }

    const language =
      payload.language ??
      campaignContext?.campaign.language ??
      content.project.language;

    let researchContext = '';
    if (researchEnabled) {
      const research = createResearchProvider();
      const result = await research.research({
        topic: topicName,
        keywords: content.topic?.keywords ?? [],
        language,
        maxSources: 5,
      });
      researchContext = [
        `Overview: ${result.overview}`,
        ...result.keyPoints.map((k) => `- ${k}`),
      ].join('\n');
    }

    let system: string;
    let user: string;

    if (campaignContext) {
      const builder = new ContentPromptBuilder();
      const prompts = builder.build({
        project: { language: content.project.language },
        campaign: campaignContext.campaign,
        series: campaignContext.series,
        topic: campaignContext.topic,
        knowledge: campaignContext.knowledge,
        previousContent: campaignContext.previousContent,
        language,
        durationSeconds: content.project.defaultDurationSeconds,
        requestId: contentId,
      });
      system = prompts.system;
      user = researchContext ? `${prompts.user}\n\nResearch notes:\n${researchContext}` : prompts.user;
    } else if (channelContext) {
      const builder = new ContentPromptBuilder();
      const prompts = builder.build({
        channel: channelContext.channel,
        series: channelContext.series,
        topic: channelContext.topic,
        knowledge: channelContext.knowledge,
        previousContent: channelContext.previousContent,
        platform: channelContext.platform,
        language,
        durationSeconds: content.project.defaultDurationSeconds,
        requestId: contentId,
      });
      system = prompts.system;
      user = researchContext ? `${prompts.user}\n\nResearch notes:\n${researchContext}` : prompts.user;
    } else {
      system = [
        'You are an expert short-form video scriptwriter. Write a vertical short video script.',
        'Return ONLY a JSON object with this shape:',
        '{"title": string, "hook": string, "script": string (full narration, no markdown), "scenes": [{"order": int, "duration": int (3-10s), "narration": string, "visualPrompt": string (detailed visual description), "subtitle": string}], "caption": string, "hashtags": string[]}',
        `Language: ${language}. Script must be engaging, factual and self-contained.`,
        'Scenes must cover the whole script, order starting at 1.',
      ].join('\n');

      user = [
        `Topic: ${topicName}`,
        content.topic?.description ? `Description: ${content.topic.description}` : '',
        researchContext ? `Research notes:\n${researchContext}` : '',
        `Target duration: ${content.project.defaultDurationSeconds ?? 60} seconds.`,
        'Write the script now.',
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    const { data, usage } = await completeJsonWithPool<ScriptOutput>(
      system,
      user,
      ScriptOutputSchema as ZodType<ScriptOutput>,
      {
        requestId: contentId,
        pool: {
          group: 'AI_TEXT',
          priority: providerOverride ? [providerOverride] : undefined,
          onUsage: (record) => void recordProviderUsage({ ...record }),
        },
      },
    );

    // Persist the script and scene breakdown (replace existing on regenerate).
    await prisma.$transaction(async (tx) => {
      await tx.script.upsert({
        where: { contentId },
        update: {
          text: data.script,
          hook: data.hook,
          fullText: data.script,
          status: 'READY',
          provider: usage.provider,
          model: usage.model,
        },
        create: {
          contentId,
          text: data.script,
          hook: data.hook,
          fullText: data.script,
          status: 'READY',
          provider: usage.provider,
          model: usage.model,
        },
      });

      await tx.scene.deleteMany({ where: { contentId } });
      for (const scene of data.scenes) {
        await tx.scene.create({
          data: {
            contentId,
            order: scene.order,
            kind: 'IMAGE',
            durationSeconds: scene.duration,
            narration: scene.narration,
            visualPrompt: scene.visualPrompt,
            subtitleText: scene.subtitle,
            status: 'PENDING',
          },
        });
      }

      await tx.content.update({
        where: { id: contentId },
        data: { title: data.title, hook: data.hook, caption: data.caption, hashtags: data.hashtags },
      });
    });

    await recordLog({
      projectId,
      contentId,
      jobType: 'CONTENT_GENERATION',
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCost: usage.estimatedCost,
      durationMs: usage.durationMs,
      requestId: contentId,
    });

    await ctx.queue.add('generate-scenes', { contentId, projectId });
  } catch (err) {
    const message = shortMessage(err);
    await failContent(contentId, message);
    await recordLog({
      projectId,
      contentId,
      jobType: 'CONTENT_GENERATION',
      status: 'FAILED',
      durationMs: Date.now() - started,
      error: message,
    });
    throw err;
  }
}
