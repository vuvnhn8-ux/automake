import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@avf/database';
import { ChannelPlatformSchema, PublishingAccountStatusSchema } from '@avf/shared';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import { getProject, getAccount } from '../lib/access.js';

function maskCredentials(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

const CreateAccountSchema = z.object({
  platform: ChannelPlatformSchema.default('FACEBOOK'),
  accountName: z.string().min(1).max(200),
  externalAccountId: z.string().max(500).nullable().optional(),
  credentials: z.string().min(1).max(4000),
  status: PublishingAccountStatusSchema.optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const UpdateAccountSchema = CreateAccountSchema.partial();

const accountPublicSelect = {
  id: true,
  projectId: true,
  platform: true,
  accountName: true,
  externalAccountId: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toPublic(account: { credentials: string } & Record<string, unknown>) {
  const { credentials, ...rest } = account;
  return { ...rest, hasCredentials: Boolean(credentials), credentialsMask: maskCredentials(credentials) };
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // Cross-project listing (all accounts across the user's projects).
  app.get('/accounts', async (request) => {
    const auth = getAuthUser(request);
    const accounts = await prisma.publishingAccount.findMany({
      where: { project: { userId: auth.id } },
      orderBy: { createdAt: 'asc' },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { channels: true } },
      },
    });
    return { accounts: accounts.map((a) => toPublic(a as unknown as { credentials: string } & Record<string, unknown>)) };
  });

  app.get('/projects/:projectId/accounts', async (request) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await getProject(auth.id, projectId);
    const accounts = await prisma.publishingAccount.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { channels: true } },
      },
    });
    return { accounts: accounts.map((a) => toPublic(a as unknown as { credentials: string } & Record<string, unknown>)) };
  });

  app.post('/projects/:projectId/accounts', async (request, reply) => {
    const auth = getAuthUser(request);
    const projectId = parseId((request.params as { projectId: string }).projectId);
    await getProject(auth.id, projectId);
    const body = parse(CreateAccountSchema, request.body);

    const encrypted = app.container.cipher.encrypt(body.credentials);
    const account = await prisma.publishingAccount.create({
      data: {
        projectId,
        platform: body.platform,
        accountName: body.accountName,
        externalAccountId: body.externalAccountId ?? null,
        credentials: encrypted,
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
      },
      select: accountPublicSelect,
    });
    return reply.code(201).send({ account: toPublic(account as never) });
  });

  app.get('/accounts/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const account = await prisma.publishingAccount.findFirst({
      where: { id, project: { userId: auth.id } },
      include: {
        channels: { select: { id: true, name: true, platform: true, isActive: true } },
      },
    });
    if (!account) {
      return reply.code(404).send({ error: 'not_found', message: 'Publishing account not found' });
    }
    const { credentials, ...rest } = account;
    return { account: { ...rest, hasCredentials: Boolean(credentials), credentialsMask: maskCredentials(credentials) } };
  });

  app.patch('/accounts/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getAccount(auth.id, id);
    const body = parse(UpdateAccountSchema, request.body);

    const data: Prisma.PublishingAccountUpdateInput = {
      ...(body.platform !== undefined ? { platform: body.platform } : {}),
      ...(body.accountName !== undefined ? { accountName: body.accountName } : {}),
      ...(body.externalAccountId !== undefined ? { externalAccountId: body.externalAccountId } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
      ...(body.credentials !== undefined ? { credentials: app.container.cipher.encrypt(body.credentials) } : {}),
    };
    const account = await prisma.publishingAccount.update({
      where: { id },
      data,
      select: accountPublicSelect,
    });
    return { account: toPublic(account as never) };
  });

  app.delete('/accounts/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getAccount(auth.id, id);
    await prisma.publishingAccount.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get('/accounts/:id/channels', async (request) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    await getAccount(auth.id, id);
    const channels = await prisma.publishingChannel.findMany({
      where: { publishingAccountId: id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        platform: true,
        isActive: true,
        facebookPage: { select: { id: true, pageName: true } },
      },
    });
    return { channels };
  });
}
