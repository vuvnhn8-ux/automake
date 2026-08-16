import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../src/lib/jwt.js';

describe('jwt', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken('user-123', 'USER');
    expect(typeof token).toBe('string');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.role).toBe('USER');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken('user-123', 'USER');
    const [header, body, sig] = token.split('.')!;
    const bad = `${header}.${body}.tampered`;
    expect(() => verifyAccessToken(bad)).toThrow();
    void sig;
  });

  it('rejects garbage', () => {
    expect(() => verifyAccessToken('not-a-token')).toThrow();
  });
});
