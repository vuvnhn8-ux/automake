import type { QueueProvider } from '@avf/queue';
import { prisma } from '@avf/database';
import { getTemplate } from '@avf/video';
import { z } from 'zod';
import { parse } from '../lib/validate.js';

export interface ContentRequestInput {
  campaignId?: string;
  topicId?: string;
  channelId?: string;
  seriesId?: string;
  title?: string;
  language?: string;
  variantOfContentId?: string;
  durationSeconds?: number;
  template?: string;
  voice?: string;
  providers?: { ai?: string; image?: string; video?: string; voice?: string };
  caption?: string;
  hashtags?: string[];
}

export const CreateContentSchema = z.object({
  campaignId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  seriesId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  language: z.string().min(2).max(16).optional(),
  durationSeconds: z.number().int().min(10).max(600).optional(),
  template: z.string().optional(),
  voice: z.string().max(100).optional(),
  caption: z.string().max(2000).optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
});

export async function createContentRecord(
  userId: string,
  projectId: string,
  input: ContentRequestInput,
): Promise<string> {
  const project = await prisma.project.findFirstOrThrow({
    where: { id: projectId, userId },
  });

  // Validate the full ownership chain for campaign/channel/series/topic
  // references so content can never point at (or leak context from) another
  // user's resources.
  let channelId = input.channelId ?? undefined;
  let seriesId = input.seriesId ?? undefined;
  const topicId = input.topicId ?? undefined;
  const campaignId = input.campaignId ?? undefined;

  if (campaignId) {
    await prisma.contentCampaign.findFirstOrThrow({
      where: { id: campaignId, projectId },
    });
  }
  if (seriesId) {
    if (campaignId) {
      const series = await prisma.contentSeries.findFirstOrThrow({
        where: { id: seriesId, campaignId },
      });
      seriesId = series.id;
    } else {
      const series = await prisma.contentSeries.findFirstOrThrow({
        where: { id: seriesId, OR: [{ channel: { projectId } }, { campaign: { project: { userId } } }] },
        include: { channel: { select: { id: true } } },
      });
      if (!channelId && series.channelId) channelId = series.channelId;
    }
  }
  if (channelId) {
    await prisma.publishingChannel.findFirstOrThrow({
      where: { id: channelId, projectId },
    });
  }
  if (topicId) {
    const topic = await prisma.topic.findFirstOrThrow({
      where: { id: topicId, projectId },
    });
    if (seriesId && topic.seriesId && topic.seriesId !== seriesId) {
      throw new Error('Topic does not belong to the given series');
    }
  }

  const content = await prisma.content.create({
    data: {
      projectId,
      campaignId: campaignId ?? null,
      topicId: topicId ?? null,
      channelId: channelId ?? null,
      seriesId: seriesId ?? null,
      language: input.language ?? null,
      variantOfContentId: input.variantOfContentId ?? null,
      title: input.title,
      caption: input.caption,
      hashtags: input.hashtags ?? [],
      status: 'DRAFT',
    },
  });

  return content.id;
}

/** Enqueue the full generation pipeline for a content record. */
export async function enqueueContentGeneration(
  queue: QueueProvider,
  params: { contentId: string; projectId: string; topicId?: string; campaignId?: string; channelId?: string; seriesId?: string; language?: string; regenerate?: boolean },
): Promise<string> {
  await prisma.content.update({
    where: { id: params.contentId },
    data: { status: 'GENERATING', errorMessage: null },
  });
  return queue.add('generate-content', {
    contentId: params.contentId,
    projectId: params.projectId,
    topicId: params.topicId,
    campaignId: params.campaignId,
    channelId: params.channelId,
    seriesId: params.seriesId,
    language: params.language,
    regenerate: params.regenerate ?? false,
  });
}

/** Creates a video record + render job and enqueues a render. */
export async function enqueueRender(
  queue: QueueProvider,
  contentId: string,
  projectId: string,
  opts?: { template?: string },
): Promise<string> {
  const content = await prisma.content.findFirstOrThrow({
    where: { id: contentId, projectId },
    include: { scenes: true },
  });

  const template = getTemplate(opts?.template ?? 'DEFAULT_REELS');

  let video = await prisma.video.findUnique({ where: { contentId } });
  if (!video) {
    video = await prisma.video.create({
      data: {
        contentId,
        projectId,
        title: content.title ?? 'Untitled video',
        template: template.name,
        resolution: `${template.width}x${template.height}`,
        fps: template.fps,
        status: 'GENERATING',
      },
    });
  } else {
    video = await prisma.video.update({
      where: { id: video.id },
      data: { status: 'RENDERING', errorMessage: null },
    });
  }

  const renderJob = await prisma.renderJob.create({
    data: {
      videoId: video.id,
      status: 'PENDING',
      config: { template: template.name, resolution: `${template.width}x${template.height}`, fps: template.fps },
    },
  });

  await queue.add('render-video', {
    videoId: video.id,
    renderJobId: renderJob.id,
    projectId,
  });

  return video.id;
}

export function parseContentInput(body: unknown): ContentRequestInput {
  return parse(CreateContentSchema, body);
}
