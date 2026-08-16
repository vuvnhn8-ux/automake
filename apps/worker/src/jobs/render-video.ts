import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@avf/database';
import { createVideoRenderer, getTemplate, resolveRenderWorkDir } from '@avf/video';
import type { SceneRenderInput, RenderRequest } from '@avf/video';
import type { WorkerContext } from '../context.js';
import { recordLog, failVideo, failRenderJob, shortMessage } from '../lib/status.js';
import { cleanupWorkDir } from '../lib/temp.js';

interface RenderVideoPayload {
  videoId: string;
  renderJobId: string;
  projectId: string;
}

async function materializeAsset(
  ctx: WorkerContext,
  workDir: string,
  fileKey: string,
  ext: string,
): Promise<string> {
  const buf = await ctx.storage.get(fileKey);
  const dest = join(workDir, `${crypto.randomUUID()}.${ext}`);
  await writeFile(dest, buf);
  return dest;
}

export async function handleRenderVideo(
  ctx: WorkerContext,
  payload: RenderVideoPayload,
): Promise<void> {
  const { videoId, renderJobId, projectId } = payload;
  const started = Date.now();

  const video = await prisma.video.findFirst({
    where: { id: videoId, projectId },
    include: {
      content: { include: { scenes: { orderBy: { order: 'asc' }, include: { assets: true } } } },
    },
  });
  if (!video) throw new Error('Video not found');

  const renderJob = await prisma.renderJob.findUnique({ where: { id: renderJobId } });
  if (!renderJob) throw new Error('Render job not found');

  await prisma.renderJob.update({
    where: { id: renderJobId },
    data: { status: 'RUNNING', startedAt: new Date(), error: null },
  });

  const workDir = resolveRenderWorkDir(videoId);

  try {
    const scenes = video.content?.scenes ?? [];
    if (scenes.length === 0) throw new Error('Video content has no scenes');

    const template = getTemplate(video.template);
    await mkdir(workDir, { recursive: true });

    const renderScenes: SceneRenderInput[] = [];
    for (const scene of scenes) {
      const image = scene.assets.find((a) => a.type === 'IMAGE' && a.status === 'READY');
      const motion = scene.assets.find((a) => a.type === 'VIDEO' && a.status === 'READY');
      const voice = scene.assets.find((a) => a.type === 'AUDIO' && a.status === 'READY');

      const input: SceneRenderInput = {
        order: scene.order,
        durationSeconds: scene.durationSeconds,
        subtitleText: scene.subtitleText ?? undefined,
      };
      if (motion?.fileKey) {
        input.videoPath = await materializeAsset(ctx, workDir, motion.fileKey, 'mp4');
      } else if (image?.fileKey) {
        input.imagePath = await materializeAsset(ctx, workDir, image.fileKey, 'png');
      }
      if (voice?.fileKey) {
        input.audioPath = await materializeAsset(ctx, workDir, voice.fileKey, 'wav');
      }
      renderScenes.push(input);
    }

    const outputPath = join(workDir, 'output.mp4');
    const request: RenderRequest = {
      width: template.width,
      height: template.height,
      fps: template.fps,
      scenes: renderScenes,
      subtitleStyle: template.subtitleStyle,
      musicPath: template.musicTrack || undefined,
      outputPath,
      workDir,
    };

    const renderer = createVideoRenderer();
    const result = await renderer.render(request);

    // Upload the finished render back to storage.
    const mimeType = renderer.name === 'mock' ? 'application/json' : 'video/mp4';
    const key = `rendered/${projectId}/${videoId}.mp4`;
    const file = await ctx.storage.put(key, await readBytes(outputPath), mimeType);

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        fileKey: file.key,
        url: file.url,
        durationSeconds: result.durationSeconds,
        errorMessage: null,
      },
    });

    await prisma.renderJob.update({
      where: { id: renderJobId },
      data: { status: 'SUCCESS', completedAt: new Date(), log: result.log.slice(-4000), error: null },
    });

    await recordLog({
      projectId,
      contentId: video.contentId,
      videoId,
      jobType: 'VIDEO_RENDER',
      provider: renderer.name,
      model: `${result.width}x${result.height}@${result.fps}fps`,
      durationMs: Date.now() - started,
    });

    await ctx.queue.add('quality-check', { videoId, projectId });

    void updated;
  } catch (err) {
    const message = shortMessage(err);
    await failRenderJob(renderJobId, message);
    await failVideo(videoId, message);
    throw err;
  } finally {
    const cleanup = await cleanupWorkDir(workDir);
    console.log(
      `[render-video] temp cleanup ${cleanup.path}: ${cleanup.removed ? 'ok' : cleanup.reason ?? 'skipped'}`,
    );
  }
}

async function readBytes(path: string): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}
