import { createStorageProvider, type StorageProvider } from '@avf/storage';
import { createQueueProvider, type QueueProvider } from '@avf/queue';
import { FacebookProvider } from '@avf/social';
import { FacebookTokenCipher } from '@avf/social';
import type { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    container: AppContainer;
    prisma: PrismaClient;
  }
}

/**
 * Process-wide service container. Providers are created once and shared.
 * Tests can pass partial overrides to buildApp().
 */
export interface AppContainer {
  storage: StorageProvider;
  queue: QueueProvider;
  facebook: FacebookProvider;
  cipher: FacebookTokenCipher;
}

export function createContainer(overrides?: Partial<AppContainer>): AppContainer {
  return {
    storage: overrides?.storage ?? createStorageProvider(),
    queue: overrides?.queue ?? createQueueProvider(),
    facebook: overrides?.facebook ?? new FacebookProvider(),
    cipher: overrides?.cipher ?? new FacebookTokenCipher(),
  };
}
