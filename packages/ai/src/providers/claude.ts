import { env } from '@avf/config';
import type { AICompletionRequest, AICompletionResult, AIProvider } from '../types.js';
import { AIErrorCode, classifyHttpError, estimateCost, fetchWithTimeout, providerError } from '../types.js';

interface ClaudeResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class ClaudeProvider implements AIProvider {
  readonly name = 'CLAUDE' as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? env.ANTHROPIC_API_KEY;
    this.model = model ?? env.ANTHROPIC_MODEL;
    if (!this.apiKey) {
      throw new Error('Claude provider requires ANTHROPIC_API_KEY');
    }
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    const systemPrompt = `${req.system}\n\n${req.jsonSchemaDescription ? `Respond with JSON matching this schema:\n${req.jsonSchemaDescription}` : ''}`;

    const body: Record<string, unknown> = {
      model: this.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: req.user }],
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
    };
    if (req.jsonMode) {
      // Claude structured output is done via a forced tool; the orchestrator also
      // re-validates with zod so a JSON preamble works as a fallback.
      body.system = `${systemPrompt}\n\nYou must respond with a single valid JSON object and nothing else.`;
    }

    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      },
      env.GEMINI_REQUEST_TIMEOUT_MS,
    );

    const raw = await response.text();
    if (!response.ok) {
      throw classifyHttpError(this.name, this.model, response.status, raw);
    }

    let json: ClaudeResponse;
    try {
      json = JSON.parse(raw);
    } catch {
      throw providerError(AIErrorCode.PROVIDER_ERROR, this.name, 'Claude returned invalid JSON', {
        model: this.model,
      });
    }

    const text =
      json.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;

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
