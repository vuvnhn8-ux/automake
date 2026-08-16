import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { projectRoutes } from './projects.js';
import { topicRoutes } from './topics.js';
import { contentRoutes } from './content.js';
import { videoRoutes } from './videos.js';
import { facebookRoutes } from './facebook.js';
import { scheduleRoutes } from './schedules.js';
import { analyticsRoutes } from './analytics.js';
import { dashboardRoutes } from './dashboard.js';
import { settingsRoutes } from './settings.js';
import { channelRoutes } from './channels.js';
import { providersRoutes } from './providers.js';
import { campaignRoutes } from './campaigns.js';
import { accountRoutes } from './accounts.js';
import { workerRoutes } from './workers.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(topicRoutes, { prefix: '/api' });
  await app.register(contentRoutes, { prefix: '/api' });
  await app.register(videoRoutes, { prefix: '/api' });
  await app.register(facebookRoutes, { prefix: '/api/facebook' });
  await app.register(scheduleRoutes, { prefix: '/api' });
  await app.register(analyticsRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(channelRoutes, { prefix: '/api' });
  await app.register(providersRoutes, { prefix: '/api' });
  await app.register(campaignRoutes, { prefix: '/api' });
  await app.register(accountRoutes, { prefix: '/api' });
  await app.register(workerRoutes, { prefix: '/api' });
}
