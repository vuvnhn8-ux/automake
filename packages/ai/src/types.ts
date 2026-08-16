import { z } from 'zod';

export type AIProviderName = 'GEMINI' | 'OPENAI' | 'CLAUDE' | 'MOCK';

export interface AICompletionRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Request structured JSON output. Providers must make a best effort. */
  jsonMode?: boolean;
  /** Human readable description of the expected JSON schema (fed to the model). */
  jsonSchemaDescription?: string;
  requestId?: string;
}

export interface AICompletionResult {
  text: string;
  provider: AIProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  durationMs: number;
}

export enum AIErrorCode {
  RATE_LIMIT = 'RATE_LIMIT',
  AUTH_ERROR = 'AUTH_ERROR',
  TIMEOUT = 'TIMEOUT',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AIErrorDetails {
  code: AIErrorCode;
  provider: string;
  model?: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(details: AIErrorDetails) {
    super(details.message);
    this.name = 'AIProviderError';
    this.code = details.code;
    this.provider = details.provider;
    this.retryable = details.retryable;
    this.statusCode = details.statusCode;
  }
}

/** Convenience factory for provider errors without casting. */
export function providerError(
  code: AIErrorCode,
  provider: string,
  message: string,
  opts?: { model?: string; retryable?: boolean; statusCode?: number },
): AIProviderError {
  return new AIProviderError({
    code,
    provider,
    model: opts?.model,
    message,
    retryable: opts?.retryable ?? false,
    statusCode: opts?.statusCode,
  });
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
}

/** Base cost table: input/output USD per 1M tokens. Updated with new models. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini-tts': { input: 0, output: 0.015 },
  'claude-3-5-haiku-latest': { input: 0.8, output: 4 },
  'claude-3-5-sonnet-latest': { input: 3, output: 15 },
};

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0;
  }
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function classifyHttpError(provider: string, model: string, status: number, body: string): AIProviderError {
  const message = `Provider ${provider} returned HTTP ${status}: ${body.slice(0, 300)}`;
  switch (status) {
    case 429:
      return new AIProviderError({ code: AIErrorCode.RATE_LIMIT, provider, model, message, retryable: true, statusCode: status });
    case 401:
    case 403:
      return new AIProviderError({ code: AIErrorCode.AUTH_ERROR, provider, model, message, retryable: false, statusCode: status });
    case 408:
      return new AIProviderError({ code: AIErrorCode.TIMEOUT, provider, model, message, retryable: true, statusCode: status });
    case 400:
      return new AIProviderError({ code: AIErrorCode.INVALID_REQUEST, provider, model, message, retryable: false, statusCode: status });
    case 500:
    case 502:
    case 503:
    case 504:
      return new AIProviderError({ code: AIErrorCode.PROVIDER_ERROR, provider, model, message, retryable: true, statusCode: status });
    default:
      return new AIProviderError({ code: AIErrorCode.UNKNOWN_ERROR, provider, model, message, retryable: false, statusCode: status });
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AIProviderError({
        code: AIErrorCode.TIMEOUT,
        provider: 'unknown',
        message: `Request timed out after ${timeoutMs}ms`,
        retryable: true,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
