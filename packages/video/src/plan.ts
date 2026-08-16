import type { RenderRequest, SceneRenderInput } from './types.js';

export function renderRequestTotalDuration(req: RenderRequest): number {
  return req.scenes.reduce((acc, s) => acc + s.durationSeconds, 0);
}

export interface SceneClip {
  inputIndex: number;
  scene: SceneRenderInput;
  startMs: number;
  endMs: number;
}

/**
 * Computes cumulative start times (in ms) for each scene, plus the total
 * duration. Used by both the renderer (adelay/concat) and the subtitle engine.
 */
export function renderRequestScenesForClip(
  req: RenderRequest,
): { clips: SceneClip[]; totalMs: number; totalSeconds: number } {
  let cursor = 0;
  const clips = req.scenes.map((scene, i) => {
    const startMs = cursor;
    const durMs = scene.durationSeconds * 1000;
    cursor += durMs;
    return {
      inputIndex: i,
      scene,
      startMs,
      endMs: startMs + durMs,
    };
  });
  return { clips, totalMs: cursor, totalSeconds: cursor / 1000 };
}
