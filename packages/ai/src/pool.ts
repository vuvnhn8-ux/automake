import { env, getProviderPriority, getProviderSetting } from '@avf/config';
import { catalogEndpoint, isOpenAICompatible, KEY_ENV_BY_PROVIDER } from '@avf/shared';
import type { AICompletionRequest, AICompletionResult, AIProvider } from './types.js';
import { AIErrorCode, AIProviderError } from './types.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { ClaudeProvider } from './providers/claude.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { MockAIProvider } from './providers/mock.js';

export interface PoolUsageRecord {
  group: string;
  provider: string;
  model: string | null;
  ok: boolean;
  errorClass: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  fallbackCount: number;
}

export interface ProviderPoolOptions {
  group: string;
  /** Ordered provider ids — first is primary, later ones are fallbacks. */
  priority?: string[];
  /** Per-call usage callback so the caller can persist ProviderUsage rows. */
  onUsage?: (record: PoolUsageRecord) => void;
}

export interface PoolResult {
  result: AICompletionResult;
  provider: string;
  fallbackCount: number;
}

/**
 * Returns a retryable-status name for a thrown error, or null when the error
 * should NOT trigger a provider fallback (auth, invalid request, bad schema).
 */
export function fallbackErrorClass(err: unknown): string | null {
  if (err instanceof AIProviderError) {
    switch (err.code) {
      case AIErrorCode.RATE_LIMIT:
      case AIErrorCode.TIMEOUT:
      case AIErrorCode.PROVIDER_ERROR:
      case AIErrorCode.UNKNOWN_ERROR:
        return err.code;
      default:
        return null;
    }
  }
  return null;
}

function envKey(provider: string): string {
  return (env as unknown as Record<string, string>)[KEY_ENV_BY_PROVIDER[provider] ?? ''] ?? '';
}

function envModel(provider: string): string {
  const modelKey = (env as unknown as Record<string, string>)[`${provider}_MODEL`] ?? '';
  return modelKey;
}

/** Build an AI text provider instance for a provider id using env+DB settings. */
export function buildTextProvider(id: string): AIProvider {
  const setting = getProviderSetting(id);
  const apiKey = setting?.apiKey || envKey(id);
  const model = setting?.model || envModel(id);
  switch (id) {
    case 'GEMINI':
      return new GeminiProvider(apiKey || undefined, model || undefined);
    case 'OPENAI':
      return new OpenAIProvider(apiKey || undefined, model || undefined);
    case 'CLAUDE':
      return new ClaudeProvider(apiKey || undefined, model || undefined);
    case 'MOCK':
      return new MockAIProvider();
    default:
      if (isOpenAICompatible(id)) {
        return new OpenAICompatibleProvider(id as never, apiKey, model, catalogEndpoint(id) ?? undefined);
      }
      throw new Error(`No text provider implementation for ${id}`);
  }
}

export function envTextProvider(): string {
  return (env as unknown as Record<string, string>).AI_TEXT_PROVIDER || 'MOCK';
}

export function textProviderPriority(): string[] {
  return resolvePriority('AI_TEXT', envTextProvider());
}

export function resolvePriority(group: string, envActive: string): string[] {
  return getProviderPriority(group, envActive || 'MOCK');
}

/**
 * Runs an AI text completion across the provider chain. Retryable failures
 * (rate limit, timeout, temporary 5xx) advance to the next provider; permanent
 * failures (auth, invalid request) abort immediately.
 */
export async function completeWithPool(
  req: AICompletionRequest,
  opts?: ProviderPoolOptions,
): Promise<PoolResult> {
  const priority = opts?.priority ?? textProviderPriority();
  let lastError: unknown = null;
  let fallbackCount = 0;

  for (const id of priority) {
    let provider: AIProvider;
    try {
      provider = buildTextProvider(id);
    } catch {
      continue;
    }
    const started = Date.now();
    try {
      const result = await provider.complete(req);
      opts?.onUsage?.({
        group: opts.group ?? 'AI_TEXT',
        provider: id,
        model: result.model,
        ok: true,
        errorClass: null,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        fallbackCount,
      });
      return { result, provider: id, fallbackCount };
    } catch (err) {
      const errorClass = fallbackErrorClass(err);
      opts?.onUsage?.({
        group: opts.group ?? 'AI_TEXT',
        provider: id,
        model: null,
        ok: false,
        errorClass,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - started,
        fallbackCount,
      });
      lastError = err;
      if (errorClass === null) throw err;
      fallbackCount += 1;
    }
  }

  throw lastError ?? new Error('All providers in the pool failed');
}
