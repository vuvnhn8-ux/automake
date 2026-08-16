import { createHmac, randomBytes } from 'node:crypto';
import { env } from '@avf/config';

/**
 * Stateless HMAC-signed OAuth state. Binds the flow to the authenticated user
 * so the public callback cannot be used to attach pages to another account.
 * Signature uses JWT_SECRET so it stays valid across restarts without extra env.
 */
export function buildState(userId: string, secret: string = env.JWT_SECRET): string {
  const nonce = randomBytes(24).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${nonce}.${userId}`).digest('base64url');
  return `${nonce}.${userId}.${sig}`;
}

export function verifyState(state: string, secret: string = env.JWT_SECRET): string | null {
  const [nonce, userId, sig] = state.split('.');
  if (!nonce || !userId || !sig) return null;
  const expected = createHmac('sha256', secret).update(`${nonce}.${userId}`).digest('base64url');
  if (sig !== expected) return null;
  return userId;
}
