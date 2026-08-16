import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parse, parseId } from '../src/lib/validate.js';

describe('parse', () => {
  it('returns typed data for valid input', () => {
    const data = parse(z.object({ n: z.number() }), { n: 3 });
    expect(data).toEqual({ n: 3 });
  });

  it('throws on invalid input', () => {
    expect(() => parse(z.object({ n: z.number() }), { n: 'x' })).toThrow();
  });

  it('applies defaults', () => {
    const data = parse(z.object({ n: z.number().default(7) }), {});
    expect(data.n).toBe(7);
  });
});

describe('parseId', () => {
  it('accepts a uuid', () => {
    expect(parseId('6b4d4f3a-2a1b-4c8e-9f0d-123456789abc')).toBe('6b4d4f3a-2a1b-4c8e-9f0d-123456789abc');
  });

  it('throws on non-uuid', () => {
    expect(() => parseId('not-a-uuid')).toThrow();
  });
});
