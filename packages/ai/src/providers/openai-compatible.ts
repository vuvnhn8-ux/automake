import { env } from '@avf/config';
import type { AICompletionRequest, AICompletionResult, AIProvider, AIProviderName } from '../types.js';
import { AIErrorCode, classifyHttpError, estimateCost, fetchWithTimeout, providerError } from '../types.js';

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Generic OpenAI-compatible chat/completions client. Drives Groq, DeepSeek,
 * Mistral, xAI, Cohere, OpenRouter, Together, Cerebras, Fireworks, Qwen and
 * Hugging Face inference through a single adapter by supplying a base URL.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(name: AIProviderName, apiKey?: string, model?: string, baseUrl?: string) {
    this.name = name;
    this.apiKey = apiKey ?? '';
    this.model = model ?? '';
    this.baseUrl = baseUrl ?? '';
    if (!this.apiKey) {
      throw new Error(`${name} provider requires an API key`);
    }
    if (!this.model) {
      throw new Error(`${name} provider requires a model`);
    }
    if (!this.baseUrl) {
      throw new Error(`${name} provider requires a base URL`);
    }
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    const systemPrompt = `${req.system}\n\n${req.jsonSchemaDescription ? `Respond with JSON matching this schema:\n${req.jsonSchemaDescription}` : ''}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: req.user },
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: false,
    };
    if (req.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      env.GEMINI_REQUEST_TIMEOUT_MS,
    );

    const raw = await response.text();
    if (!response.ok) {
      throw classifyHttpError(this.name, this.model, response.status, raw);
    }

    let json: OpenAIResponse;
    try {
      json = JSON.parse(raw);
    } catch {
      throw providerError(AIErrorCode.PROVIDER_ERROR, this.name, `${this.name} returned invalid JSON`, {
        model: this.model,
      });
    }

    const text = json.choices?.[0]?.message?.content ?? '';
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

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
