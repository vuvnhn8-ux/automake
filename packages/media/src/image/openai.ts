import { env } from '@avf/config';
import type { GeneratedAsset, ImageGenerationInput, ImageProvider } from '../types.js';
import { fetchBinary, mediaError } from '../types.js';

export class OpenAIImageProvider implements ImageProvider {
  readonly name = 'OPENAI' as const;
  readonly model: string;

  constructor(model?: string) {
    this.model = model ?? env.OPENAI_IMAGE_MODEL;
  }

  async generateImage(input: ImageGenerationInput): Promise<GeneratedAsset> {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw mediaError('AUTH_ERROR', this.name, 'OPENAI_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        size: input.size ?? '1024x1024',
        n: 1,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw mediaError('PROVIDER_ERROR', this.name, `OpenAI image HTTP ${response.status}: ${raw.slice(0, 200)}`, true);
    }

    let json: { data?: { b64_json?: string; url?: string }[] };
    try {
      json = JSON.parse(raw);
    } catch {
      throw mediaError('PROVIDER_ERROR', this.name, 'OpenAI image returned invalid JSON');
    }

    const item = json.data?.[0];
    let buffer: Buffer;
    let mimeType = 'image/png';
    if (item?.b64_json) {
      buffer = Buffer.from(item.b64_json, 'base64');
    } else if (item?.url) {
      const fetched = await fetchBinary(item.url, {}, env.IMAGE_TIMEOUT_MS);
      buffer = fetched.buffer;
      mimeType = fetched.contentType ?? 'image/png';
    } else {
      throw mediaError('PROVIDER_ERROR', this.name, 'OpenAI image returned no data');
    }

    return { data: buffer, mimeType, provider: this.name, model: this.model };
  }
}
