import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@avf/database';
import { parse } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const UpsertSettingSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
  description: z.string().max(500).optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async (request) => {
    getAuthUser(request);
    const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    return { settings };
  });

  app.get('/settings/:key', async (request, reply) => {
    getAuthUser(request);
    const key = (request.params as { key: string }).key;
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) {
      return reply.code(404).send({ error: 'not_found', message: 'Setting not found' });
    }
    return { setting };
  });

  app.put('/settings', async (request, reply) => {
    const auth = getAuthUser(request);
    if (auth.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    }
    const body = parse(UpsertSettingSchema, request.body);
    const value = body.value as Prisma.InputJsonValue;
    const setting = await prisma.systemSetting.upsert({
      where: { key: body.key },
      update: { value, description: body.description },
      create: { key: body.key, value, description: body.description },
    });
    return reply.code(200).send({ setting });
  });
}
