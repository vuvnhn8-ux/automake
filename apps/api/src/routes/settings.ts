import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@avf/database';
import {
  SecretCipher,
  getTelegramConfig,
  getTelegramBotToken,
  sendTelegramMessage,
} from '@avf/config';
import { parse } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const UpsertSettingSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
  description: z.string().max(500).optional(),
});

const TelegramConfigSchema = z.object({
  botToken: z.string().max(4096).nullable().optional(),
  chatId: z.string().max(256).nullable().optional(),
  dailyReportEnabled: z.boolean().optional(),
  reportTime: z.string().max(32).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

const TelegramTestSchema = z.object({
  botToken: z.string().max(4096).optional(),
  chatId: z.string().max(256).optional(),
});

function maskToken(token: string): string {
  if (token.length <= 10) return '••••••••';
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}

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

  // ---------------------------------------------------------------------------
  // Telegram (bot token stored encrypted; daily report scheduling).
  // ---------------------------------------------------------------------------

  app.get('/settings/telegram', async (request) => {
    getAuthUser(request);
    const config = await getTelegramConfig();
    return { config };
  });

  app.put('/settings/telegram', async (request, reply) => {
    const auth = getAuthUser(request);
    if (auth.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    }
    const body = parse(TelegramConfigSchema, request.body);
    const cipher = new SecretCipher();
    const write = (key: string, value: unknown) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value: value as Prisma.InputJsonValue },
        create: { key, value: value as Prisma.InputJsonValue },
      });
    const remove = (key: string) =>
      prisma.systemSetting.delete({ where: { key } }).catch(() => undefined);

    if (body.botToken === null) {
      await remove('telegram.botToken');
      await remove('telegram.botTokenMask');
    } else if (typeof body.botToken === 'string' && body.botToken.length > 0) {
      await write('telegram.botToken', cipher.encrypt(body.botToken));
      await write('telegram.botTokenMask', maskToken(body.botToken));
    }
    if (body.chatId === null) {
      await remove('telegram.chatId');
    } else if (typeof body.chatId === 'string' && body.chatId.length > 0) {
      await write('telegram.chatId', body.chatId);
    }
    if (typeof body.dailyReportEnabled === 'boolean') {
      await write('telegram.dailyReportEnabled', body.dailyReportEnabled);
    }
    if (body.reportTime === null) {
      await remove('telegram.reportTime');
    } else if (typeof body.reportTime === 'string' && body.reportTime.length > 0) {
      await write('telegram.reportTime', body.reportTime);
    }
    if (body.timezone === null) {
      await remove('telegram.timezone');
    } else if (typeof body.timezone === 'string' && body.timezone.length > 0) {
      await write('telegram.timezone', body.timezone);
    }

    return reply.code(200).send({ ok: true, config: await getTelegramConfig() });
  });

  app.post('/settings/telegram/test', async (request, reply) => {
    const auth = getAuthUser(request);
    if (auth.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    }
    const body = parse(TelegramTestSchema, request.body);
    const config = await getTelegramConfig();
    const storedToken = await getTelegramBotToken();
    const token = body.botToken?.trim() || storedToken;
    const chatId = body.chatId?.trim() || config.chatId || '';
    if (!token || !chatId) {
      return reply.code(400).send({ ok: false, message: 'Set a bot token and chat id first' });
    }
    const result = await sendTelegramMessage(token, chatId, '✅ Automake · Telegram connected successfully');
    return reply.code(200).send({ ok: result.ok, message: result.message });
  });
}
