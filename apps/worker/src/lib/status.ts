import { prisma } from '@avf/database';

/** Record a generation step in the audit log and (optionally) cost data. */
export async function recordLog(params: {
  userId?: string;
  projectId?: string;
  contentId?: string;
  videoId?: string;
  jobType: string;
  provider?: string;
  model?: string;
  status?: 'SUCCESS' | 'FAILED';
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  durationMs?: number;
  requestId?: string;
  error?: string;
}): Promise<void> {
  try {
    await prisma.generationLog.create({ data: params });
  } catch (err) {
    console.error('[worker] failed to record generation log:', err);
  }
}

export async function failContent(contentId: string, message: string): Promise<void> {
  await prisma.content.update({
    where: { id: contentId },
    data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
  });
}

export async function failScene(sceneId: string, message: string): Promise<void> {
  await prisma.scene.update({
    where: { id: sceneId },
    data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
  });
}

export async function failMedia(mediaId: string, message: string): Promise<void> {
  await prisma.mediaAsset.update({
    where: { id: mediaId },
    data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
  });
}

export async function failVideo(videoId: string, message: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
  });
}

export async function failRenderJob(renderJobId: string, message: string, log?: string): Promise<void> {
  await prisma.renderJob.update({
    where: { id: renderJobId },
    data: { status: 'FAILED', error: message.slice(0, 2000), log: log?.slice(-4000) ?? null },
  });
}

export async function failPublishingJob(publishingJobId: string, message: string): Promise<void> {
  await prisma.publishingJob.update({
    where: { id: publishingJobId },
    data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
  });
}

export function shortMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
