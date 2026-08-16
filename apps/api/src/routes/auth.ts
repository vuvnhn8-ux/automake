import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '@avf/config';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { parse } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const REFRESH_COOKIE = 'avf_refresh';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/refresh',
    expires: expiresAt,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (request, reply) => {
    const body = parse(RegisterSchema, request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return reply.code(409).send({ error: 'conflict', message: 'Email already registered' });
    }

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        name: body.name ?? body.email.split('@')[0] ?? 'User',
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return sendAuthResponse(request, reply, user);
  });

  app.post('/login', async (request, reply) => {
    const body = parse(LoginSchema, request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return reply.code(403).send({ error: 'forbidden', message: 'Account disabled' });
    }

    return sendAuthResponse(request, reply, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  });

  app.post('/refresh', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: 'unauthorized', message: 'No refresh token' });
    }
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Session expired' });
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Account unavailable' });
    }

    // Rotate the refresh token.
    const newToken = randomBytes(48).toString('base64url');
    await prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: hashToken(newToken), expiresAt: new Date(Date.now() + refreshTtlMs()) },
    });

    setRefreshCookie(reply, newToken, new Date(Date.now() + refreshTtlMs()));
    return {
      accessToken: signAccessToken(user.id, user.role),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth/refresh' });
    return { ok: true };
  });

  app.get('/me', async (request, reply) => {
    const auth = getAuthUser(request);
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) {
      return reply.code(404).send({ error: 'not_found', message: 'User not found' });
    }
    return { user };
  });
}

async function sendAuthResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  user: { id: string; email: string; name: string; role: string },
): Promise<unknown> {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 200),
    },
  });

  setRefreshCookie(reply, token, expiresAt);
  return {
    accessToken: signAccessToken(user.id, user.role),
    user,
  };
}

function refreshTtlMs(): number {
  const match = env.JWT_REFRESH_TTL.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1]!, 10);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * unitMs[match[2]!]!;
}
