import { env } from '@avf/config';
import type { AICompletionRequest, AICompletionResult, AIProvider } from '../types.js';
import { AIErrorCode, classifyHttpError, estimateCost, fetchWithTimeout, providerError } from '../types.js';

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'OPENAI' as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? env.OPENAI_API_KEY;
    this.model = model ?? env.OPENAI_MODEL;
    if (!this.apiKey) {
      throw new Error('OpenAI provider requires OPENAI_API_KEY');
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
      // gpt-4o / gpt-4o-mini support strict structured outputs via response_format.
      body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
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
      throw providerError(AIErrorCode.PROVIDER_ERROR, this.name, 'OpenAI returned invalid JSON', {
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
