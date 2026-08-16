import { describe, expect, it } from 'vitest';
import { MockAIProvider } from '../src/providers/mock.js';
import { ScriptOutputSchema } from '@avf/shared';

describe('MockAIProvider', () => {
  it('emits a schema-valid script for any topic', async () => {
    const provider = new MockAIProvider();
    const result = await provider.complete({
      system: 'You are a scriptwriter.',
      user: 'Why do cats purr?',
      jsonMode: true,
    });

    expect(result.provider).toBe('MOCK');
    expect(result.model).toBe('mock-script-v1');
    expect(result.text.length).toBeGreaterThan(0);

    const parsed = ScriptOutputSchema.safeParse(JSON.parse(result.text));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scenes.length).toBeGreaterThan(0);
      expect(parsed.data.scenes[0]!.order).toBe(1);
    }
  });
});
