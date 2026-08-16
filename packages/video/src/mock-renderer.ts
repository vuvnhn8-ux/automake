import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderRequestTotalDuration } from './plan.js';
import type { RenderRequest, RenderResult, VideoRenderer } from './types.js';

/**
 * Development renderer used when FFmpeg is unavailable (RENDER_DRIVER=mock).
 * Writes a manifest file plus a JSON sidecar carrying the metadata that QA
 * would normally extract from a real video. The pipeline stays testable
 * end-to-end; switch to RENDER_DRIVER=ffmpeg for real MP4 output.
 */
export class MockVideoRenderer implements VideoRenderer {
  readonly name = 'mock';

  async render(req: RenderRequest): Promise<RenderResult> {
    await mkdir(req.workDir, { recursive: true });

    const manifest = {
      renderer: 'mock',
      width: req.width,
      height: req.height,
      fps: req.fps,
      durationSeconds: renderRequestTotalDuration(req),
      scenes: req.scenes.map((s) => ({
        order: s.order,
        durationSeconds: s.durationSeconds,
        hasImage: Boolean(s.imagePath),
        hasVideo: Boolean(s.videoPath),
        hasAudio: Boolean(s.audioPath),
        subtitleText: s.subtitleText,
      })),
      musicPath: req.musicPath ?? null,
      subtitleStyle: req.subtitleStyle,
      outputPath: req.outputPath,
      renderedAt: new Date().toISOString(),
    };

    await writeFile(req.outputPath, JSON.stringify(manifest, null, 2), 'utf8');
    const sidecar = join(req.workDir, 'render-result.json');
    await writeFile(sidecar, JSON.stringify(manifest, null, 2), 'utf8');

    return {
      outputPath: req.outputPath,
      durationSeconds: manifest.durationSeconds,
      width: req.width,
      height: req.height,
      fps: req.fps,
      sizeBytes: Buffer.byteLength(JSON.stringify(manifest)),
      log: 'Mock renderer: no real video was produced. Set RENDER_DRIVER=ffmpeg for MP4 output.',
    };
  }
}
