import { env } from '@avf/config';
import { LocalStorageProvider } from './local.js';
import { S3StorageProvider } from './s3.js';
import type { StorageProvider } from './types.js';

export function createStorageProvider(): StorageProvider {
  switch (env.STORAGE_DRIVER) {
    case 's3':
      return new S3StorageProvider();
    case 'local':
    default:
      return new LocalStorageProvider();
  }
}

export type { StorageProvider, StoredObject } from './types.js';
export { LocalStorageProvider } from './local.js';
export { S3StorageProvider } from './s3.js';
