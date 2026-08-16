import { describe, expect, it } from 'vitest';
import { FacebookTokenCipher } from '../src/index.js';

describe('FacebookTokenCipher', () => {
  it('round-trips a token', () => {
    const cipher = new FacebookTokenCipher('test-secret-key-abcdefghijklmnopqrstuvwxyz');
    const token = 'EAAGm0...page-access-token';
    const encrypted = cipher.encrypt(token);
    expect(encrypted).not.toContain(token);
    expect(cipher.decrypt(encrypted)).toBe(token);
  });

  it('produces unique ciphertexts for the same plaintext', () => {
    const cipher = new FacebookTokenCipher('test-secret-key-abcdefghijklmnopqrstuvwxyz');
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('accepts a 32-byte base64 key', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const cipher = new FacebookTokenCipher(key);
    expect(cipher.decrypt(cipher.encrypt('abc'))).toBe('abc');
  });

  it('throws without a configured key', () => {
    expect(() => new FacebookTokenCipher('')).toThrow();
  });

  it('throws on corrupted payloads', () => {
    const cipher = new FacebookTokenCipher('test-secret-key-abcdefghijklmnopqrstuvwxyz');
    const encrypted = cipher.encrypt('data');
    expect(() => cipher.decrypt(encrypted.slice(0, -4))).toThrow();
  });
});
