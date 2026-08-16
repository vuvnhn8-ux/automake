import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { createVideoRenderer, renderRequestScenesForClip, buildSrt } from '@avf/video';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const videoDetailInclude = {
  content: { include: { topic: { select: { id: true, name: true } }, scenes: { orderBy: { order: 'asc' as const }, include: { assets: true } } } },
  renderJobs: { orderBy: { createdAt: 'desc' as const } },
  publishingJobs: { orderBy: { createdAt: 'desc' as const }, include: { facebookPage: { select: { id: true, pageName: true } } } },
  project: { select: { id: true, name: true, facebookPage: { select: { id: true, pageName: true } } } },
};

const PublishSchema = z.object({
  facebookPageIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  facebookPageId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  description: z.string().max(2200).optional(),
});

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  const container = app.container;

  app.get('/videos', async (request) => {
    const auth = getAuthUser(request);
    const query = parse(
      z.object({ projectId: z.string().uuid().optional(), status: z.string().optional(), limit: z.coerce.number().int().max(100).default(50), offset: z.coerce.number().int().default(0) }),
      request.query,
    );
    const videos = await prisma.video.findMany({
      where: {
        project: { userId: auth.id },
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      include: {
        project: { select: { id: true, name: true } },
        publishingJobs: { select: { id: true, status: true, scheduledAt: true } },
      },
    });
    return { videos, count: videos.length };
  });

  app.get('/videos/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const video = await prisma.video.findFirst({
      where: { id, project: { userId: auth.id } },
      include: videoDetailInclude,
    });
    if (!video) {
      return reply.code(404).send({ error: 'not_found', message: 'Video not found' });
    }
    return { video };
  });

  app.post('/videos/:id/publish', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(PublishSchema, request.body);

    const video = await prisma.video.findFirst({
      where: { id, project: { userId: auth.id } },
      include: { content: true },
    });
    if (!video) {
      return reply.code(404).send({ error: 'not_found', message: 'Video not found' });
    }
    if (video.status === 'DRAFT' || video.status === 'FAILED') {
      return reply.code(400).send({ error: 'invalid_state', message: 'Video is not ready to publish' });
    }

    const requestedPageIds = body.facebookPageIds ?? (body.facebookPageId ? [body.facebookPageId] : []);
    if (requestedPageIds.length === 0) {
      return reply.code(400).send({ error: 'validation', message: 'At least one Facebook page is required' });
    }
    const pageIds = requestedPageIds;

    const pages = await prisma.facebookPage.findMany({
      where: { id: { in: pageIds }, userId: auth.id },
    });
    if (pages.length === 0) {
      return reply.code(404).send({ error: 'not_found', message: 'Facebook page not found' });
    }
    const foundIds = new Set(pages.map((p) => p.id));
    const missing = pageIds.filter((pid) => !foundIds.has(pid));
    if (missing.length > 0) {
      return reply.code(403).send({ error: 'forbidden', message: 'One or more Facebook pages do not belong to you' });
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const createdJobs = [];
    for (const pageId of pageIds) {
      const publishingJob = await prisma.publishingJob.create({
        data: {
          videoId: id,
          facebookPageId: pageId,
          channelId: body.channelId ?? null,
          scheduledAt,
          status: 'PENDING',
        },
      });
      createdJobs.push(publishingJob);

      const delayMs = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
      await container.queue.add('publish-video', {
        publishingJobId: publishingJob.id,
        videoId: id,
        projectId: video.projectId,
      }, { delayMs });
    }

    return reply.code(201).send({ publishingJobs: createdJobs });
  });

  app.post('/videos/:id/publishing-jobs/:jobId/cancel', async (request, reply) => {
    const auth = getAuthUser(request);
    const jobId = parseId((request.params as { jobId: string }).jobId);
    const job = await prisma.publishingJob.findFirst({
      where: { id: jobId, video: { project: { userId: auth.id } } },
    });
    if (!job) {
      return reply.code(404).send({ error: 'not_found', message: 'Publishing job not found' });
    }
    if (job.status !== 'PENDING') {
      return reply.code(400).send({ error: 'invalid_state', message: `Cannot cancel a ${job.status} job` });
    }
    const updated = await prisma.publishingJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });
    return { publishingJob: updated };
  });

  app.post('/videos/:id/publishing-jobs/:jobId/retry', async (request, reply) => {
    const auth = getAuthUser(request);
    const jobId = parseId((request.params as { jobId: string }).jobId);
    const job = await prisma.publishingJob.findFirst({
      where: { id: jobId, video: { project: { userId: auth.id } } },
    });
    if (!job) {
      return reply.code(404).send({ error: 'not_found', message: 'Publishing job not found' });
    }
    if (job.status !== 'FAILED') {
      return reply.code(400).send({ error: 'invalid_state', message: 'Only failed jobs can be retried' });
    }
    const updated = await prisma.publishingJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', errorMessage: null },
    });
    await container.queue.add('publish-video', {
      publishingJobId: jobId,
      videoId: job.videoId,
      projectId: (await prisma.video.findUnique({ where: { id: job.videoId } }))?.projectId ?? '',
    });
    return { publishingJob: updated };
  });

  app.post('/videos/:id/qa', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const video = await prisma.video.findFirst({ where: { id, project: { userId: auth.id } } });
    if (!video) {
      return reply.code(404).send({ error: 'not_found', message: 'Video not found' });
    }
    // Manual QA — reuse the renderer's probe capability.
    const renderer = createVideoRenderer();
    const report: Record<string, unknown> = {};
    if (renderer.name === 'mock') {
      report.mocked = true;
      report.message = 'Mock renderer: run with RENDER_DRIVER=ffmpeg for playability probing.';
    } else if (video.fileKey) {
      const storage = container.storage;
      const local = join(process.env.RENDER_WORK_DIR || 'data/render', 'qa');
      await mkdir(local, { recursive: true });
      const buf = await storage.get(video.fileKey);
      const probePath = join(local, `${id}.mp4`);
      await writeFile(probePath, buf);
      try {
        const { runFFmpeg } = await import('@avf/video');
        // Parsing input with ffmpeg -i and -f null validates playability.
        const result = await runFFmpeg(['-v', 'error', '-i', probePath, '-f', 'null', '-'], 120000);
        report.playable = result.code === 0;
        report.log = result.stderr.slice(-2000);
      } catch (err) {
        report.playable = false;
        report.error = err instanceof Error ? err.message : 'probe failed';
      }
    } else {
      report.playable = false;
      report.message = 'No video file on record';
    }
    return { report };
  });

  // Convenience: generate an SRT preview for a video's scenes.
  app.get('/videos/:id/subtitle.srt', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const video = await prisma.video.findFirst({
      where: { id, project: { userId: auth.id } },
      include: { content: { include: { scenes: { orderBy: { order: 'asc' as const } } } } },
    });
    if (!video) {
      return reply.code(404).send({ error: 'not_found', message: 'Video not found' });
    }
    const scenes = video.content?.scenes ?? [];
    const { clips } = renderRequestScenesForClip({
      width: 1080, height: 1920, fps: 30,
      scenes: scenes.map((s) => ({ order: s.order, durationSeconds: s.durationSeconds, subtitleText: s.subtitleText ?? undefined })),
      subtitleStyle: { fontFamily: 'sans', fontSize: 1, color: '#fff', outlineColor: '#000', outlineWidth: 0, backgroundColor: '#000', backgroundOpacity: 0, position: 'bottom', animation: 'none' },
      outputPath: '',
      workDir: '',
    });
    const cues = clips
      .filter((c) => c.scene.subtitleText?.trim())
      .map((c, i) => ({ index: i + 1, startMs: c.startMs, endMs: c.endMs, text: c.scene.subtitleText!.trim() }));
    const srt = buildSrt(cues);
    return reply.type('text/plain').send(srt);
  });
}
