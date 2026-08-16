import { describe, expect, it } from 'vitest';
import { renderRequestScenesForClip, renderRequestTotalDuration } from '../src/plan.js';
import type { RenderRequest } from '../src/types.js';

const base: Omit<RenderRequest, 'scenes'> = {
  width: 1080,
  height: 1920,
  fps: 30,
  subtitleStyle: {
    fontFamily: 'sans',
    fontSize: 10,
    color: '#fff',
    outlineColor: '#000',
    outlineWidth: 0,
    backgroundColor: '#000',
    backgroundOpacity: 0,
    position: 'bottom',
    animation: 'none',
  },
  outputPath: 'out.mp4',
  workDir: 'work',
};

describe('renderRequestScenesForClip', () => {
  it('computes cumulative start times', () => {
    const req: RenderRequest = {
      ...base,
      scenes: [
        { order: 1, durationSeconds: 5 },
        { order: 2, durationSeconds: 6 },
        { order: 3, durationSeconds: 4 },
      ],
    };
    const { clips, totalMs, totalSeconds } = renderRequestScenesForClip(req);
    expect(clips.map((c) => c.startMs)).toEqual([0, 5000, 11000]);
    expect(clips.map((c) => c.endMs)).toEqual([5000, 11000, 15000]);
    expect(totalMs).toBe(15000);
    expect(totalSeconds).toBe(15);
  });

  it('matches the total duration helper', () => {
    const req: RenderRequest = {
      ...base,
      scenes: [{ order: 1, durationSeconds: 7 }, { order: 2, durationSeconds: 3 }],
    };
    expect(renderRequestTotalDuration(req)).toBe(10);
  });
});
