import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import { parse, parseId } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';
import { buildState, verifyState } from '../lib/facebook-state.js';

function pagePublic(page: {
  id: string;
  pageId: string;
  pageName: string;
  status: string;
  tokenExpiresAt: Date | null;
}) {
  return { id: page.id, pageId: page.pageId, pageName: page.pageName, status: page.status, tokenExpiresAt: page.tokenExpiresAt };
}

export async function facebookRoutes(app: FastifyInstance): Promise<void> {
  const container = app.container;

  app.get('/auth-url', async (request) => {
    const auth = getAuthUser(request);
    const url = container.facebook.getLoginUrl(buildState(auth.id));
    return { url };
  });

  app.get('/oauth/callback', async (request, reply) => {
    const query = parse(
      z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional(), error_description: z.string().optional() }),
      request.query,
    );

    if (query.error) {
      return reply.code(400).send({ error: 'facebook_auth_failed', message: query.error_description ?? query.error });
    }
    if (!query.code || !query.state) {
      return reply.code(400).send({ error: 'invalid_request', message: 'Missing code or state' });
    }

    const userId = verifyState(query.state);
    if (!userId) {
      return reply.code(400).send({ error: 'invalid_state', message: 'Invalid state parameter' });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(400).send({ error: 'invalid_state', message: 'Unknown user' });
    }

    const token = await container.facebook.exchangeCodeForToken(query.code);
    const pages = await container.facebook.listPages(token.accessToken);

    // Optionally refresh the long-lived token for later page-token refresh flows.
    const existing = await prisma.facebookPage.findMany({
      where: { userId: user.id, pageId: { in: pages.map((p) => p.pageId) } },
    });
    const existingByPage = new Map(existing.map((p) => [p.pageId, p]));

    for (const page of pages) {
      const current = existingByPage.get(page.pageId);
      const encrypted = container.cipher.encrypt(page.accessToken);
      if (current) {
        await prisma.facebookPage.update({
          where: { id: current.id },
          data: { accessTokenEnc: encrypted, tokenExpiresAt: page.tokenExpiresAt, status: 'CONNECTED' },
        });
      } else {
        await prisma.facebookPage.create({
          data: {
            userId: user.id,
            pageId: page.pageId,
            pageName: page.pageName,
            accessTokenEnc: encrypted,
            tokenExpiresAt: page.tokenExpiresAt,
            scopes: page.scopes,
          },
        });
      }
    }

    return reply.type('text/html').send(
      `<!doctype html><html><head><title>Connected</title></head><body><script>window.close()</script><p>Facebook page connected. You can close this window.</p></body></html>`,
    );
  });

  app.get('/pages', async (request) => {
    const auth = getAuthUser(request);
    const pages = await prisma.facebookPage.findMany({
      where: { userId: auth.id },
      orderBy: { installedAt: 'desc' },
      select: { id: true, pageId: true, pageName: true, status: true, tokenExpiresAt: true, installedAt: true },
    });
    return { pages: pages.map(pagePublic) };
  });

  app.delete('/pages/:id', async (request, reply) => {
    const auth = getAuthUser(request);
    const id = parseId((request.params as { id: string }).id);
    const page = await prisma.facebookPage.findFirst({ where: { id, userId: auth.id } });
    if (!page) {
      return reply.code(404).send({ error: 'not_found', message: 'Page not found' });
    }
    await prisma.facebookPage.delete({ where: { id } });
    return reply.code(204).send();
  });
}
