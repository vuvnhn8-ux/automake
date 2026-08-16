import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './index.js';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  const raw = env.SECRET_ENCRYPTION_KEY || env.JWT_SECRET || 'dev-secret-change-me-please';
  return createHash('sha256').update(raw).digest();
}

export interface SecretCipherOptions {
  /** Force a key derivation source override (used in tests). */
  secret?: string;
}

export class SecretCipher {
  private readonly key: Buffer;

  constructor(options: SecretCipherOptions = {}) {
    this.key = options.secret ? createHash('sha256').update(options.secret).digest() : deriveKey();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed ciphertext payload');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
