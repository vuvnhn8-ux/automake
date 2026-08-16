import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken } from '../lib/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; role: string };
  }
}

export interface AuthUser {
  id: string;
  role: string;
}

export function getAuthUser(request: FastifyRequest): AuthUser {
  const user = request.user;
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Registers the JWT bearer verification preHandler.
 */
export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', undefined);

  app.addHook('preHandler', async (request, reply) => {
    const url = request.url;
    if (url.startsWith('/api/auth/') || url.startsWith('/api/facebook/oauth/callback')) {
      return;
    }
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = verifyAccessToken(token);
      request.user = { id: payload.sub, role: payload.role };
    } catch {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
    }
  });
});
