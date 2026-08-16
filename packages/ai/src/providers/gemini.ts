import { env } from '@avf/config';
import type {
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
} from '../types.js';
import {
  AIErrorCode,
  classifyHttpError,
  estimateCost,
  fetchWithTimeout,
  providerError,
} from '../types.js';

const GEMINI_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    hook: { type: 'string' },
    script: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          duration: { type: 'integer' },
          narration: { type: 'string' },
          visualPrompt: { type: 'string' },
          subtitle: { type: 'string' },
        },
      },
    },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
};

export class GeminiProvider implements AIProvider {
  readonly name = 'GEMINI' as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? env.GEMINI_API_KEY;
    this.model = model ?? env.GEMINI_MODEL;
    if (!this.apiKey) {
      throw new Error('Gemini provider requires GEMINI_API_KEY');
    }
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const systemPrompt = `${req.system}\n\n${req.jsonSchemaDescription ? `Respond with JSON matching this schema:\n${req.jsonSchemaDescription}` : ''}`;

    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens ?? 4096,
      ...(req.jsonMode ? GEMINI_JSON_SCHEMA : {}),
    };
    if (req.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = GEMINI_JSON_SCHEMA;
    }

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig,
        }),
      },
      env.GEMINI_REQUEST_TIMEOUT_MS,
    );

    const raw = await response.text();
    if (!response.ok) {
      throw classifyHttpError(this.name, this.model, response.status, raw);
    }

    let json: {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    try {
      json = JSON.parse(raw);
    } catch {
      throw providerError(
        AIErrorCode.PROVIDER_ERROR,
        this.name,
        'Gemini returned invalid JSON',
        { model: this.model },
      );
    }

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('');

    const usage = json.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(this.name, this.model, inputTokens, outputTokens),
      durationMs: Date.now() - started,
    };
  }
}
