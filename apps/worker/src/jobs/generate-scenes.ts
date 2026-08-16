import { prisma } from '@avf/database';
import type { WorkerContext } from '../context.js';
import { failContent, shortMessage } from '../lib/status.js';

interface GenerateScenesPayload {
  contentId: string;
  projectId: string;
}

/**
 * Fan-out: for every PENDING scene of the content, enqueue the per-asset media
 * jobs (image, voice; video when the scene kind requires motion).
 */
export async function handleGenerateScenes(
  ctx: WorkerContext,
  payload: GenerateScenesPayload,
): Promise<void> {
  const { contentId, projectId } = payload;

  const scenes = await prisma.scene.findMany({
    where: { contentId },
    orderBy: { order: 'asc' },
  });

  if (scenes.length === 0) {
    await failContent(contentId, 'No scenes generated for content');
    throw new Error('No scenes generated for content');
  }

  try {
    for (const scene of scenes) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { status: 'GENERATING', errorMessage: null },
      });
      await ctx.queue.add('generate-image', { sceneId: scene.id, contentId, projectId });
      await ctx.queue.add('generate-voice', { sceneId: scene.id, contentId, projectId });
      if (scene.kind === 'VIDEO') {
        await ctx.queue.add('generate-video', { sceneId: scene.id, contentId, projectId });
      }
    }
  } catch (err) {
    const message = shortMessage(err);
    await failContent(contentId, message);
    throw err;
  }
}
