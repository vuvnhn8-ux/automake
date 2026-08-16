import { prisma, type Prisma } from '@avf/database';
import { createImageProvider, createVideoProvider, createVoiceProvider } from '@avf/media';
import { getTemplate } from '@avf/video';
import { env } from '@avf/config';
import type { WorkerContext } from '../context.js';
import { recordLog, failScene, failMedia, shortMessage } from '../lib/status.js';

interface MediaPayload {
  sceneId: string;
  contentId: string;
  projectId: string;
}

/**
 * Shared fan-in: once every scene of a content has READY assets (image + voice
 * minimum), mark the content READY and enqueue the render job.
 */
async function maybeEnqueueRender(
  ctx: WorkerContext,
  contentId: string,
  projectId: string,
): Promise<void> {
  const scenes = await prisma.scene.findMany({
    where: { contentId },
    include: { assets: true },
    orderBy: { order: 'asc' },
  });
  if (scenes.length === 0) return;

  const allReady = scenes.every((scene) => {
    const hasImage = scene.assets.some((a) => a.type === 'IMAGE' && a.status === 'READY');
    const hasVoice = scene.assets.some((a) => a.type === 'AUDIO' && a.status === 'READY');
    const videoOk = scene.kind === 'IMAGE' || scene.assets.some((a) => a.type === 'VIDEO' && a.status === 'READY');
    return hasImage && hasVoice && videoOk;
  });

  if (!allReady) return;

  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return;

  await prisma.content.update({
    where: { id: contentId },
    data: { status: 'READY', errorMessage: null },
  });

  const template = getTemplate(env.DEFAULT_TEMPLATE);

  let video = await prisma.video.findUnique({ where: { contentId } });
  if (!video) {
    video = await prisma.video.create({
      data: {
        contentId,
        projectId,
        title: content.title ?? 'Untitled video',
        caption: content.caption,
        hashtags: content.hashtags,
        template: template.name,
        resolution: `${template.width}x${template.height}`,
        fps: template.fps,
        status: 'RENDERING',
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
      config: {
        template: template.name,
        resolution: `${template.width}x${template.height}`,
        fps: template.fps,
      },
    },
  });

  await ctx.queue.add('render-video', {
    videoId: video.id,
    renderJobId: renderJob.id,
    projectId,
  });
}

async function storeAsset(
  ctx: WorkerContext,
  data: Buffer,
  mimeType: string,
  prefix: string,
  projectId: string,
): Promise<{ fileKey: string; url: string | null; sizeBytes: number }> {
  const key = `${prefix}/${crypto.randomUUID()}`;
  const stored = await ctx.storage.put(key, data, mimeType);
  return { fileKey: stored.key, url: stored.url, sizeBytes: stored.sizeBytes ?? data.length };
}

async function upsertMedia(
  sceneId: string,
  contentId: string,
  type: 'IMAGE' | 'VIDEO' | 'AUDIO',
): Promise<{ id: string }> {
  const existing = await prisma.mediaAsset.findFirst({
    where: { sceneId, type },
  });
  if (existing) {
    return prisma.mediaAsset.update({
      where: { id: existing.id },
      data: { status: 'GENERATING', errorMessage: null, url: null, fileKey: null },
      select: { id: true },
    });
  }
  return prisma.mediaAsset.create({
    data: { sceneId, contentId, type, status: 'GENERATING' },
    select: { id: true },
  });
}

export async function handleGenerateImage(
  ctx: WorkerContext,
  payload: MediaPayload,
): Promise<void> {
  const { sceneId, contentId, projectId } = payload;
  const started = Date.now();
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene) throw new Error('Scene not found');

  const media = await upsertMedia(sceneId, contentId, 'IMAGE');
  try {
    const provider = createImageProvider();
    const asset = await provider.generateImage({
      prompt: scene.visualPrompt ?? scene.narration ?? 'default scene visual',
      size: env.IMAGE_SIZE,
      requestId: contentId,
    });
    const { fileKey, url, sizeBytes } = await storeAsset(ctx, asset.data, asset.mimeType, `images/${projectId}`, projectId);

    await prisma.mediaAsset.update({
      where: { id: media.id },
      data: {
        status: 'READY',
        provider: provider.name,
        model: provider.model,
        fileKey,
        url,
        mimeType: asset.mimeType,
        sizeBytes,
        width: (asset.metadata?.width as number) ?? null,
        height: (asset.metadata?.height as number) ?? null,
        metadata: (asset.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await recordLog({
      projectId,
      contentId,
      jobType: 'IMAGE_GENERATION',
      provider: provider.name,
      model: provider.model,
      durationMs: Date.now() - started,
    });

    await maybeEnqueueRender(ctx, contentId, projectId);
  } catch (err) {
    const message = shortMessage(err);
    await failMedia(media.id, message);
    await failScene(sceneId, message);
    throw err;
  }
}

export async function handleGenerateVideo(
  ctx: WorkerContext,
  payload: MediaPayload,
): Promise<void> {
  const { sceneId, contentId, projectId } = payload;
  const started = Date.now();
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene) throw new Error('Scene not found');

  const media = await upsertMedia(sceneId, contentId, 'VIDEO');
  try {
    const provider = createVideoProvider();
    const asset = await provider.generateVideo({
      prompt: scene.visualPrompt ?? scene.narration ?? 'default scene motion',
      durationSeconds: scene.durationSeconds,
      resolution: '1080x1920',
      requestId: contentId,
    });
    const { fileKey, url, sizeBytes } = await storeAsset(ctx, asset.data, asset.mimeType, `videos/${projectId}`, projectId);

    await prisma.mediaAsset.update({
      where: { id: media.id },
      data: {
        status: 'READY',
        provider: provider.name,
        model: provider.model,
        fileKey,
        url,
        mimeType: asset.mimeType,
        sizeBytes,
        metadata: (asset.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await recordLog({
      projectId,
      contentId,
      jobType: 'VIDEO_GENERATION',
      provider: provider.name,
      model: provider.model,
      durationMs: Date.now() - started,
    });

    await maybeEnqueueRender(ctx, contentId, projectId);
  } catch (err) {
    const message = shortMessage(err);
    await failMedia(media.id, message);
    await failScene(sceneId, message);
    throw err;
  }
}

export async function handleGenerateVoice(
  ctx: WorkerContext,
  payload: MediaPayload,
): Promise<void> {
  const { sceneId, contentId, projectId } = payload;
  const started = Date.now();
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene) throw new Error('Scene not found');

  const media = await upsertMedia(sceneId, contentId, 'AUDIO');
  try {
    const provider = createVoiceProvider();
    const asset = await provider.generateVoice({
      text: scene.narration ?? '',
      language: 'vi-VN',
      voice: env.TTS_VOICE || undefined,
      requestId: contentId,
    });
    const { fileKey, url, sizeBytes } = await storeAsset(ctx, asset.data, asset.mimeType, `audio/${projectId}`, projectId);

    await prisma.mediaAsset.update({
      where: { id: media.id },
      data: {
        status: 'READY',
        provider: provider.name,
        model: provider.model,
        fileKey,
        url,
        mimeType: asset.mimeType,
        sizeBytes,
        durationSeconds: asset.durationSeconds ?? null,
        metadata: (asset.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await recordLog({
      projectId,
      contentId,
      jobType: 'VOICE_GENERATION',
      provider: provider.name,
      model: provider.model,
      durationMs: Date.now() - started,
    });

    await maybeEnqueueRender(ctx, contentId, projectId);
  } catch (err) {
    const message = shortMessage(err);
    await failMedia(media.id, message);
    await failScene(sceneId, message);
    throw err;
  }
}
