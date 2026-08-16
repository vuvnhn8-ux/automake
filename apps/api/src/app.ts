import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { env } from '@avf/config';
import { loadProviderConfig } from '@avf/config';
import { prisma } from '@avf/database';
import { authPlugin } from './plugins/auth.js';
import { errorHandler } from './plugins/error.js';
import { createContainer, type AppContainer } from './services/container.js';
import { registerRoutes } from './routes/index.js';

export interface BuildAppOptions {
  logger?: boolean;
  container?: Partial<AppContainer>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? env.NODE_ENV !== 'test',
    bodyLimit: 50 * 1024 * 1024,
  });

  const container = createContainer(opts.container);

  await loadProviderConfig();

  await app.register(cors, {
    origin: [env.APP_URL, 'http://localhost:3000'].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ error: 'rate_limited', message: 'Too many requests' }),
  });

  await app.register(fastifyStatic, {
    root: resolve(env.STORAGE_ROOT),
    prefix: '/files/',
    decorateReply: false,
  });

  app.decorate('prisma', prisma);
  app.decorate('container', container);

  app.setErrorHandler(errorHandler);

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await app.register(authPlugin);

  await registerRoutes(app);

  return app;
}
