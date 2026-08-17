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

/** Agnes AI video generation — completely free, async text-to-video via REST. */
export class AgnesVideoProvider implements VideoProvider {
  readonly name = 'AGNES' as const;
  readonly model = 'agnes-video-v2.0';

  async generateVideo(input: VideoGenerationInput): Promise<GeneratedAsset> {
    const apiKey = env.AGNES_API_KEY;
    if (!apiKey) {
      throw mediaError('AUTH_ERROR', this.name, 'AGNES_API_KEY is not configured');
    }
    const base = env.AGNES_API_URL;

    const [w, h] = (input.resolution ?? '1152x768').split('x').map(Number);
    const durationSec = input.durationSeconds ?? 5;
    const numFrames = Math.min(441, Math.max(9, Math.round(durationSec * 24) + 1));

    const createRes = await fetch(`${base}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
        width: w || 1152,
        height: h || 768,
        num_frames: numFrames,
        frame_rate: 24,
      }),
    });
    const raw = await createRes.text();
    if (!createRes.ok) {
      throw mediaError('PROVIDER_ERROR', this.name, `Agnes HTTP ${createRes.status}: ${raw.slice(0, 200)}`, true);
    }
    const json = JSON.parse(raw) as { video_id?: string; task_id?: string; error?: string };
    const videoId = json.video_id ?? json.task_id;
    if (!videoId) {
      throw mediaError('PROVIDER_ERROR', this.name, `Agnes did not return a video_id: ${raw.slice(0, 200)}`);
    }

    const result = await this.pollResult(videoId, apiKey);
    const videoUrl = result.video_url ?? result.url ?? result.output;
    if (!videoUrl || typeof videoUrl !== 'string') {
      throw mediaError('PROVIDER_ERROR', this.name, `Agnes task failed: ${JSON.stringify(result).slice(0, 200)}`);
    }

    const fetched = await fetch(videoUrl);
    if (!fetched.ok) {
      throw mediaError('PROVIDER_ERROR', this.name, `Agnes video download failed: HTTP ${fetched.status}`, true);
    }
    return {
      data: Buffer.from(await fetched.arrayBuffer()),
      mimeType: 'video/mp4',
      provider: this.name,
      model: this.model,
    };
  }

  private async pollResult(videoId: string, apiKey: string): Promise<Record<string, unknown>> {
    const base = env.AGNES_API_URL;
    for (let i = 0; i < 120; i++) {
      const res = await fetch(`${base.replace(/\/v1$/, '')}/agnesapi?video_id=${encodeURIComponent(videoId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        const status = json.status ?? json.state;
        if (status === 'succeeded' || status === 'completed' || status === 'done') {
          return json;
        }
        if (status === 'failed' || status === 'error') {
          throw mediaError('PROVIDER_ERROR', this.name, `Agnes generation failed: ${JSON.stringify(json).slice(0, 200)}`);
        }
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw mediaError('TIMEOUT', this.name, 'Agnes generation timed out while polling');
  }
}
