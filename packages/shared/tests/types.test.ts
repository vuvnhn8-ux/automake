import { describe, expect, it } from 'vitest';
import { ScriptOutputSchema } from '../src/types.js';

describe('ScriptOutputSchema', () => {
  const valid = {
    title: 'T',
    hook: 'H',
    script: 'S',
    scenes: [
      { order: 1, duration: 6, narration: 'n', visualPrompt: 'v', subtitle: 's' },
    ],
    caption: 'c',
    hashtags: ['#x'],
  };

  it('accepts a well-formed script', () => {
    const result = ScriptOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('defaults hashtags to []', () => {
    const { hashtags, ...rest } = valid;
    const result = ScriptOutputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hashtags).toEqual([]);
  });

  it('rejects scenes without narration', () => {
    const bad = { ...valid, scenes: [{ order: 1, duration: 6, visualPrompt: 'v', subtitle: 's' }] };
    expect(ScriptOutputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty scenes array', () => {
    const bad = { ...valid, scenes: [] };
    expect(ScriptOutputSchema.safeParse(bad).success).toBe(false);
  });
});
