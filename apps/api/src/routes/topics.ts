import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { findDuplicate } from '@avf/shared';
import { completeJsonWithPool, buildTopicSuggestionPrompt, GeneratedTopicsSchema } from '@avf/ai';
import { recordProviderUsage } from '@avf/config';
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

const GenerateTopicsSchema = z.object({
  count: z.number().int().min(1).max(20).default(10),
  language: z.string().min(2).max(16).nullable().optional(),
});

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

  // -------------------------------------------------------------------------
  // AI topic suggestions for a project (project-level strategy).
  // -------------------------------------------------------------------------

  app.post('/projects/:projectId/topics/generate', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.id } });
    if (!project) {
      return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    }
    const body = parse(GenerateTopicsSchema, request.body);
    const config = (project.config ?? {}) as Record<string, unknown>;
    const keywords = Array.isArray(config.keywords) ? (config.keywords as string[]) : [];

    const [existingTopics, previousContent] = await Promise.all([
      prisma.topic.findMany({
        where: { projectId },
        select: { name: true },
      }),
      prisma.content.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { title: true, topic: { select: { name: true } } },
      }),
    ]);

    const { system, user } = buildTopicSuggestionPrompt({
      channel: {
        name: project.name,
        description: project.description,
        language: body.language ?? project.language,
        keywords: keywords.length ? keywords : undefined,
        aiInstructions: typeof config.contentInstructions === 'string' ? config.contentInstructions : undefined,
        excludedTopics: typeof config.avoid === 'string' ? [config.avoid] : undefined,
      },
      existingTopics: existingTopics.map((t) => t.name),
      previousContent: previousContent.map((c) => ({
        title: c.title ?? undefined,
        topic: c.topic?.name ?? undefined,
      })),
      count: body.count,
      language: body.language ?? project.language,
    });

    const { data } = await completeJsonWithPool(system, user, GeneratedTopicsSchema, {
      requestId: `project:${projectId}:topics`,
      pool: {
        group: 'AI_TEXT',
        onUsage: (record) => void recordProviderUsage({ ...record }),
      },
    });

    const existing = existingTopics.map((t) => t.name);
    const created: string[] = [];
    const skippedDuplicates: string[] = [];
    for (const candidate of data.topics) {
      if (findDuplicate(candidate.title, existing)) {
        skippedDuplicates.push(candidate.title);
        continue;
      }
      const topic = await prisma.topic.create({
        data: {
          projectId,
          name: candidate.title,
          description: candidate.description,
          keywords: candidate.keywords,
          language: body.language ?? project.language,
          source: 'AI',
        },
      });
      created.push(topic.id);
      existing.push(candidate.title);
    }

    return reply.code(201).send({ created, skippedDuplicates, count: created.length });
  });

  // -------------------------------------------------------------------------
  // Topic management
  // -------------------------------------------------------------------------

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

  app.post('/topics/:id/use', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const topic = await prisma.topic.findFirst({ where: { id } });
    if (!topic) {
      return reply.code(404).send({ error: 'not_found', message: 'Topic not found' });
    }
    await prisma.project.findFirstOrThrow({ where: { id: topic.projectId, userId: auth.id } });

    const updated = await prisma.topic.update({
      where: { id },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
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
