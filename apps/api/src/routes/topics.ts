import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const CreateTopicSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  keywords: z.array(z.string().min(1).max(100)).max(50).default([]),
  language: z.string().min(2).max(16).optional(),
  frequencyPerDay: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

const UpdateTopicSchema = CreateTopicSchema.partial();

export async function topicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects/:projectId/topics', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const topics = await prisma.topic.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contents: true } } },
    });
    return { topics };
  });

  app.post('/projects/:projectId/topics', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: auth.id } });
    const body = parse(CreateTopicSchema, request.body);
    const topic = await prisma.topic.create({
      data: { projectId, ...body },
    });
    return reply.code(201).send({ topic });
  });

  app.patch('/topics/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(UpdateTopicSchema, request.body);

    const topic = await prisma.topic.findFirst({ where: { id } });
    if (!topic) {
      return reply.code(404).send({ error: 'not_found', message: 'Topic not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: topic.projectId, userId: auth.id } });

    const updated = await prisma.topic.update({ where: { id }, data: body });
    return { topic: updated };
  });

  app.delete('/topics/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const topic = await prisma.topic.findFirst({ where: { id } });
    if (!topic) {
      return reply.code(404).send({ error: 'not_found', message: 'Topic not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: topic.projectId, userId: auth.id } });
    await prisma.topic.delete({ where: { id } });
    return reply.code(204).send();
  });
}
