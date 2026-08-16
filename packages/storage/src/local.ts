import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '@avf/config';
import type { StorageProvider, StoredObject } from './types.js';

/**
 * Local filesystem storage. Files are written under STORAGE_ROOT and served
 * by the API's static file route.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor(root?: string) {
    this.root = resolve(env.STORAGE_ROOT ?? root ?? './data/storage');
  }

  private resolveKey(key: string): string {
    // Prevent path traversal.
    const normalized = join(this.root, key);
    if (!normalized.startsWith(this.root + sep())) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return normalized;
  }

  async put(key: string, body: Buffer | Uint8Array, mimeType?: string): Promise<StoredObject> {
    const filePath = this.resolveKey(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return { key, url: this.publicUrl(key), sizeBytes: body.byteLength, mimeType };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolveKey(key));
  }

  publicUrl(key: string): string | null {
    const base = env.STORAGE_PUBLIC_URL.replace(/\/$/, '');
    return `${base}/${key}`;
  }
}

function sep(): string {
  // Same value on all platforms for the prefix check; normalise slashes.
  if (process.platform === 'win32') {
    return '\\';
  }
  return '/';
}
