import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { ContentStatusSchema } from '@avf/shared';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import {
  createContentRecord,
  enqueueContentGeneration,
  enqueueRender,
  parseContentInput,
} from '../services/pipeline.js';

const UpdateContentSchema = z.object({
  title: z.string().max(200).optional(),
  hook: z.string().max(2000).optional(),
  caption: z.string().max(2000).optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
  status: ContentStatusSchema.optional(),
});

const UpdateSceneSchema = z.object({
  narration: z.string().max(5000).optional(),
  visualPrompt: z.string().max(5000).optional(),
  subtitleText: z.string().max(2000).optional(),
  durationSeconds: z.number().int().min(1).max(60).optional(),
  order: z.number().int().min(1).optional(),
});

const ReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

const contentInclude = {
  topic: { select: { id: true, name: true } },
  script: true,
  scenes: {
    orderBy: { order: 'asc' as const },
    include: { assets: { orderBy: { createdAt: 'asc' as const } } },
  },
  video: {
    include: {
      renderJobs: { orderBy: { createdAt: 'desc' as const }, take: 5 },
      publishingJobs: { orderBy: { createdAt: 'desc' as const }, take: 5 },
    },
  },
};

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  const container = app.container;

  app.get('/projects/:projectId/content', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const contents = await prisma.content.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { topic: { select: { id: true, name: true } }, video: true, scenes: { select: { id: true, status: true, order: true } }, script: { select: { status: true } } },
    });
    return { contents };
  });

  app.post('/projects/:projectId/content', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });

    const input = parseContentInput(request.body);
    const contentId = await createContentRecord(auth.id, projectId, input);
    await enqueueContentGeneration(container.queue, {
      contentId,
      projectId,
      topicId: input.topicId,
      channelId: input.channelId,
      seriesId: input.seriesId,
    });

    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId }, include: contentInclude });
    return reply.code(201).send({ content });
  });

  app.get('/content/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const content = await prisma.content.findFirst({
      where: { id, project: { userId: auth.id } },
      include: contentInclude,
    });
    if (!content) {
      return reply.code(404).send({ error: 'not_found', message: 'Content not found' });
    }
    return { content };
  });

  app.patch('/content/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(UpdateContentSchema, request.body);
    const existing = await prisma.content.findFirst({ where: { id, project: { userId: auth.id } } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Content not found' });
    }
    const content = await prisma.content.update({ where: { id }, data: body, include: contentInclude });
    return { content };
  });

  app.post('/content/:id/regenerate-script', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const content = await prisma.content.findFirst({ where: { id, project: { userId: auth.id } } });
    if (!content) {
      return reply.code(404).send({ error: 'not_found', message: 'Content not found' });
    }
    await enqueueContentGeneration(container.queue, {
      contentId: id,
      projectId: content.projectId,
      topicId: content.topicId ?? undefined,
      regenerate: true,
    });
    return { ok: true };
  });

  app.patch('/content/:id/scenes/:sceneId', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const sceneId = parseId((request.params as { sceneId: string }).sceneId);
    const body = parse(UpdateSceneSchema, request.body);

    const scene = await prisma.scene.findFirst({
      where: { id: sceneId, contentId: id, content: { project: { userId: auth.id } } },
    });
    if (!scene) {
      return reply.code(404).send({ error: 'not_found', message: 'Scene not found' });
    }
    const updated = await prisma.scene.update({ where: { id: sceneId }, data: body });
    return { scene: updated };
  });

  app.post('/content/:id/scenes/:sceneId/regenerate', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const sceneId = parseId((request.params as { sceneId: string }).sceneId);
    const body = parse(z.object({ kind: z.enum(['image', 'voice', 'video', 'all']).default('all') }), request.body ?? {});

    const scene = await prisma.scene.findFirst({
      where: { id: sceneId, contentId: id, content: { project: { userId: auth.id } } },
      include: { content: { select: { projectId: true } } },
    });
    if (!scene) {
      return reply.code(404).send({ error: 'not_found', message: 'Scene not found' });
    }
    const projectId = scene.content.projectId;

    if (body.kind === 'image' || body.kind === 'video' || body.kind === 'all') {
      const type: 'IMAGE' | 'VIDEO' = body.kind === 'video' ? 'VIDEO' : 'IMAGE';
      await prisma.mediaAsset.deleteMany({ where: { sceneId, type } });
      await prisma.scene.update({ where: { id: sceneId }, data: { status: 'PENDING', errorMessage: null } });
      await container.queue.add(body.kind === 'video' ? 'generate-video' : 'generate-image', {
        sceneId,
        contentId: id,
        projectId,
      });
    }
    if (body.kind === 'voice' || body.kind === 'all') {
      await prisma.mediaAsset.deleteMany({ where: { sceneId, type: 'AUDIO' } });
      await container.queue.add('generate-voice', {
        sceneId,
        contentId: id,
        projectId,
      });
    }

    return { ok: true };
  });

  app.delete('/content/:id/scenes/:sceneId', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const sceneId = parseId((request.params as { sceneId: string }).sceneId);
    const scene = await prisma.scene.findFirst({
      where: { id: sceneId, contentId: id, content: { project: { userId: auth.id } } },
    });
    if (!scene) {
      return reply.code(404).send({ error: 'not_found', message: 'Scene not found' });
    }
    await prisma.scene.delete({ where: { id: sceneId } });
    return reply.code(204).send();
  });

  app.post('/content/:id/scenes/reorder', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(ReorderSchema, request.body);

    const scenes = await prisma.scene.findMany({
      where: { contentId: id, content: { project: { userId: auth.id } } },
      select: { id: true },
    });
    const ids = new Set(scenes.map((s) => s.id));
    if (body.order.length !== scenes.length || body.order.some((s) => !ids.has(s))) {
      return reply.code(400).send({ error: 'validation_error', message: 'Reorder list must contain every scene id' });
    }

    await prisma.$transaction(async (tx) => {
      for (const [index, sceneId] of body.order.entries()) {
        // Offset to avoid unique-constraint collisions during reorder.
        await tx.scene.update({ where: { id: sceneId }, data: { order: 100_000 + index } });
      }
      for (const [index, sceneId] of body.order.entries()) {
        await tx.scene.update({ where: { id: sceneId }, data: { order: index + 1 } });
      }
    });

    return { ok: true };
  });

  app.post('/content/:id/render', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(z.object({ template: z.string().optional() }), request.body ?? {});

    const content = await prisma.content.findFirst({ where: { id, project: { userId: auth.id } } });
    if (!content) {
      return reply.code(404).send({ error: 'not_found', message: 'Content not found' });
    }
    const videoId = await enqueueRender(container.queue, id, content.projectId, { template: body.template });
    return { ok: true, videoId };
  });
}
