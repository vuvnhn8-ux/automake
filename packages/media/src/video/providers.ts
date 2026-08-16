import { env } from '@avf/config';
import type { GeneratedAsset, VideoGenerationInput, VideoProvider } from '../types.js';
import { mediaError } from '../types.js';

/**
 * Mock video provider. Returns a small placeholder buffer and metadata flags.
 * Used when no real motion-generation key is available; the renderer treats
 * scenes as static images when VIDEO_PROVIDER=MOCK.
 */
export class MockVideoProvider implements VideoProvider {
  readonly name = 'MOCK' as const;
  readonly model = 'mock-video-v1';

  async generateVideo(input: VideoGenerationInput): Promise<GeneratedAsset> {
    const durationSeconds = input.durationSeconds ?? 5;
    // A tiny valid headerless placeholder is enough for the pipeline; real
    // providers (Veo/Kling/Runway) return actual encoded video bytes.
    const data = Buffer.from(
      JSON.stringify({
        mock: true,
        prompt: input.prompt,
        durationSeconds,
        resolution: input.resolution ?? '1080x1920',
      }),
    );
    return {
      data,
      mimeType: 'video/placeholder',
      provider: this.name,
      model: this.model,
      metadata: {
        isPlaceholder: true,
        durationSeconds,
        resolution: input.resolution ?? '1080x1920',
      },
    };
  }
}

/** Runway Gen-3 / Gen-4 via REST — wired to the same interface. */
export class RunwayVideoProvider implements VideoProvider {
  readonly name = 'RUNWAY' as const;
  readonly model = 'gen4';

  async generateVideo(input: VideoGenerationInput): Promise<GeneratedAsset> {
    const apiKey = env.RUNWAY_API_KEY;
    if (!apiKey) {
      throw mediaError('AUTH_ERROR', this.name, 'RUNWAY_API_KEY is not configured');
    }
    const response = await fetch(`${env.RUNWAY_API_URL}/image_to_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: this.model,
        promptImage: input.imageUrl,
        promptText: input.prompt,
        duration: input.durationSeconds ?? 5,
        ratio: '9:16',
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw mediaError('PROVIDER_ERROR', this.name, `Runway HTTP ${response.status}: ${raw.slice(0, 200)}`, true);
    }
    const json = JSON.parse(raw);
    const id = json?.id;
    if (!id) {
      throw mediaError('PROVIDER_ERROR', this.name, 'Runway did not return a generation id');
    }
    // Async generation: poll until done (simplified for the worker loop).
    const task = await this.pollTask(id, apiKey);
    if (task.status === 'SUCCEEDED' && task.output?.[0]) {
      const fetched = await fetch(task.output[0] as string);
      return {
        data: Buffer.from(await fetched.arrayBuffer()),
        mimeType: 'video/mp4',
        provider: this.name,
        model: this.model,
      };
    }
    throw mediaError('PROVIDER_ERROR', this.name, `Runway task failed: ${task.failure ?? 'unknown'}`);
  }

  private async pollTask(id: string, apiKey: string): Promise<{
    status?: string;
    output?: string[];
    failure?: string | null;
  }> {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${env.RUNWAY_API_URL}/tasks/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          status?: string;
          output?: string[];
          failure?: string | null;
        };
        if (json.status === 'SUCCEEDED' || json.status === 'FAILED') {
          return json;
        }
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw mediaError('TIMEOUT', this.name, 'Runway generation timed out while polling');
  }
}
