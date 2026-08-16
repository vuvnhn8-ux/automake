import { describe, expect, it } from 'vitest';
import { SecretCipher } from '../src/cipher.js';

describe('SecretCipher', () => {
  it('encrypts and decrypts a value', () => {
    const cipher = new SecretCipher({ secret: 'test-secret-for-roundtrip' });
    const enc = cipher.encrypt('sk-abc-1234567890');
    expect(enc).not.toContain('sk-abc');
    expect(cipher.decrypt(enc)).toBe('sk-abc-1234567890');
  });

  it('is non-deterministic (fresh IV per call)', () => {
    const cipher = new SecretCipher({ secret: 'test-secret-for-roundtrip' });
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects tampered payloads', () => {
    const cipher = new SecretCipher({ secret: 'test-secret-for-roundtrip' });
    const enc = cipher.encrypt('secret-value');
    const flipped = enc.slice(0, -1) + (enc.endsWith('A') ? 'B' : 'A');
    expect(() => cipher.decrypt(flipped)).toThrow();
  });

  it('fails to decrypt with a different key', () => {
    const a = new SecretCipher({ secret: 'key-one-for-cipher-test' });
    const b = new SecretCipher({ secret: 'key-two-for-cipher-test' });
    expect(() => b.decrypt(a.encrypt('value'))).toThrow();
  });

  it('rejects malformed payloads', () => {
    const cipher = new SecretCipher({ secret: 'test-secret-for-roundtrip' });
    expect(() => cipher.decrypt('not-a-valid-payload')).toThrow();
  });
});
