import { env } from '@avf/config';
import type { StorageProvider } from '@avf/storage';
import type { QueueProvider } from '@avf/queue';
import { createQueueProvider } from '@avf/queue';
import { createStorageProvider } from '@avf/storage';
import { FacebookTokenCipher } from '@avf/social';

export interface WorkerContext {
  queue: QueueProvider;
  storage: StorageProvider;
  cipher: FacebookTokenCipher;
}

export function createWorkerContext(overrides?: Partial<WorkerContext>): WorkerContext {
  const queue = overrides?.queue ?? createQueueProvider();
  return {
    queue,
    storage: overrides?.storage ?? createStorageProvider(),
    cipher: overrides?.cipher ?? new FacebookTokenCipher(),
  };
}

export function now(): number {
  return Date.now();
}

export { env };
