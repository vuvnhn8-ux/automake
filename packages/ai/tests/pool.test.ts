import { describe, expect, it, vi } from 'vitest';
import { AIErrorCode, providerError, type AICompletionRequest, type AICompletionResult } from '../src/types.js';
import { completeWithPool, fallbackErrorClass } from '../src/pool.js';

vi.mock('@avf/config', () => ({
  env: {},
  getProviderPriority: () => ['MOCK'],
  getProviderSetting: () => null,
}));

vi.mock('../src/providers/gemini.js', () => ({
  GeminiProvider: class {
    readonly name = 'GEMINI';
    readonly model = 'gemini-test';
    async complete(): Promise<AICompletionResult> {
      const { providerError, AIErrorCode } = await import('../src/types.js');
      throw providerError(AIErrorCode.RATE_LIMIT, 'GEMINI', 'quota exceeded', { retryable: true });
    }
  },
}));

vi.mock('../src/providers/claude.js', () => ({
  ClaudeProvider: class {
    readonly name = 'CLAUDE';
    readonly model = 'claude-test';
    async complete(): Promise<AICompletionResult> {
      const { providerError, AIErrorCode } = await import('../src/types.js');
      throw providerError(AIErrorCode.AUTH_ERROR, 'CLAUDE', 'bad api key', { retryable: false });
    }
  },
}));

vi.mock('../src/providers/openai.js', () => ({
  OpenAIProvider: class {
    readonly name = 'OPENAI';
    readonly model = 'gpt-test';
    async complete(): Promise<AICompletionResult> {
      return okResult('gpt-test');
    }
  },
}));

function okResult(model: string, text = 'ok'): AICompletionResult {
  return {
    text,
    provider: 'MOCK',
    model,
    inputTokens: 10,
    outputTokens: 5,
    estimatedCost: 0,
    durationMs: 1,
  };
}

describe('completeWithPool', () => {
  const req: AICompletionRequest = { system: 's', user: 'u' };

  it('falls back to the next provider on a retryable error', async () => {
    const usage: string[] = [];
    const result = await completeWithPool(req, {
      group: 'AI_TEXT',
      priority: ['GEMINI', 'OPENAI'],
      onUsage: (r) => usage.push(`${r.provider}:${r.ok ? 'ok' : r.errorClass}`),
    });

    expect(result.provider).toBe('OPENAI');
    expect(result.fallbackCount).toBe(1);
    expect(result.result.text).toBe('ok');
    expect(usage).toEqual(['GEMINI:RATE_LIMIT', 'OPENAI:ok']);
  });

  it('aborts without fallback on a permanent error', async () => {
    await expect(
      completeWithPool(req, { priority: ['GEMINI', 'CLAUDE', 'OPENAI'] }),
    ).rejects.toMatchObject({ code: AIErrorCode.AUTH_ERROR });
  });

  it('uses the first healthy provider', async () => {
    const result = await completeWithPool(req, { priority: ['OPENAI', 'GEMINI'] });
    expect(result.provider).toBe('OPENAI');
    expect(result.fallbackCount).toBe(0);
  });

  it('rethrows the last error when every provider fails', async () => {
    await expect(completeWithPool(req, { priority: ['GEMINI'] })).rejects.toMatchObject({
      code: AIErrorCode.RATE_LIMIT,
    });
  });

  it('maps only retryable codes to fallback classes', () => {
    expect(fallbackErrorClass(providerError(AIErrorCode.RATE_LIMIT, 'P', 'r', { retryable: true }))).toBe('RATE_LIMIT');
    expect(fallbackErrorClass(providerError(AIErrorCode.TIMEOUT, 'P', 't', { retryable: true }))).toBe('TIMEOUT');
    expect(fallbackErrorClass(providerError(AIErrorCode.PROVIDER_ERROR, 'P', 'p', { retryable: true }))).toBe('PROVIDER_ERROR');
    expect(fallbackErrorClass(providerError(AIErrorCode.AUTH_ERROR, 'P', 'a'))).toBeNull();
    expect(fallbackErrorClass(providerError(AIErrorCode.INVALID_REQUEST, 'P', 'i'))).toBeNull();
    expect(fallbackErrorClass(new Error('boom'))).toBeNull();
  });
});
