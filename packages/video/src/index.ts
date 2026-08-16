import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@avf/config';
import type { RenderRequest, RenderResult, VideoRenderer } from './types.js';
import { FFmpegVideoRenderer } from './ffmpeg.js';
import { MockVideoRenderer } from './mock-renderer.js';

export function createVideoRenderer(): VideoRenderer {
  switch (env.RENDER_DRIVER) {
    case 'mock':
      return new MockVideoRenderer();
    case 'ffmpeg':
    default:
      return new FFmpegVideoRenderer();
  }
}

export async function fileSize(path: string): Promise<number> {
  const s = await stat(path);
  return s.size;
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export { FFmpegVideoRenderer } from './ffmpeg.js';
export { runFFmpeg, escapeFilterPath } from './ffmpeg.js';
export { MockVideoRenderer } from './mock-renderer.js';

export { renderRequestTotalDuration, renderRequestScenesForClip } from './plan.js';
export { buildSrt, buildAss, buildCues } from './subtitles.js';
export { TEMPLATES, getTemplate } from './templates.js';

export function resolveRenderWorkDir(videoId: string): string {
  const root =
    env.WORKER_TEMP_DIR || process.env.RENDER_WORK_DIR || join(process.cwd(), 'data', 'render');
  return join(root, videoId);
}

export type { RenderRequest, RenderResult, VideoRenderer, SceneRenderInput, SubtitleStyle, SubtitleCue, TemplateDefinition } from './types.js';
export { DEFAULT_SUBTITLE_STYLE } from './types.js';
