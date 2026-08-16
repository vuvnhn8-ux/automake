import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { PublishingModeSchema, VideoTemplateSchema } from '@avf/shared';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  language: z.string().min(2).max(16).optional(),
  category: z.string().max(100).optional(),
  defaultTemplate: VideoTemplateSchema.optional(),
  defaultVoice: z.string().max(100).optional(),
  defaultDurationSeconds: z.number().int().min(10).max(600).optional(),
  publishingMode: PublishingModeSchema.optional(),
});

const UpdateProjectSchema = CreateProjectSchema.partial();

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request) => {
    const auth = getAuthUser(request);
    const projects = await prisma.project.findMany({
      where: { userId: auth.id, isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { topics: true, videos: true, contents: true, schedules: true } } },
    });
    return { projects };
  });

  app.post('/', async (request, reply) => {
    const auth = getAuthUser(request);
    const body = parse(CreateProjectSchema, request.body);
    const project = await prisma.project.create({
      data: { userId: auth.id, ...body },
    });
    return reply.code(201).send({ project });
  });

  app.get('/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const project = await prisma.project.findFirst({
      where: { id, userId: auth.id },
      include: {
        facebookPage: { select: { id: true, pageId: true, pageName: true, status: true } },
        _count: { select: { topics: true, videos: true, contents: true, schedules: true } },
      },
    });
    if (!project) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    return { project };
  });

  app.patch('/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const body = parse(UpdateProjectSchema, request.body);

    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }

    const project = await prisma.project.update({ where: { id }, data: body });
    return { project };
  });

  app.delete('/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const existing = await prisma.project.findFirst({ where: { id, userId: auth.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    await prisma.project.delete({ where: { id } });
    return reply.code(204).send();
  });
}
