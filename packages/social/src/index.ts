import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';
import { env } from '@avf/config';

export class FacebookTokenCipher {
  private readonly key: Buffer;

  constructor(secret?: string) {
    const raw = secret ?? env.FACEBOOK_TOKEN_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'FACEBOOK_TOKEN_ENCRYPTION_KEY is required to store page access tokens.',
      );
    }
    // Accept either a 32-byte base64 key or a plain string (hashed to 32 bytes).
    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) {
        this.key = decoded;
        return;
      }
    } catch {
      /* fall through */
    }
    this.key = createHash('sha256').update(raw).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Invalid encrypted token payload');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}

export { FacebookProvider } from './facebook.js';
export { GenericPlatformProvider, createPlatformProvider } from './generic.js';
export type {
  FacebookPageInfo,
  PublishVideoInput,
  PublishVideoResult,
  FacebookUser,
  SocialProvider,
} from './types.js';
export { SocialProviderError } from './types.js';
