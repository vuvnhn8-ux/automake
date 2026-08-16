import { describe, expect, it } from 'vitest';
import { checkFFmpeg, assertFFmpegAvailable } from '../src/lib/ffmpeg.js';

describe('checkFFmpeg', () => {
  it('reports unavailable (not available) for a missing binary instead of throwing', async () => {
    const probe = await checkFFmpeg('definitely-not-an-ffmpeg-binary-xyz');
    expect(probe.available).toBe(false);
    expect(probe.error).toBeTruthy();
  });
});

describe('assertFFmpegAvailable', () => {
  it('throws a clear error when FFmpeg is required but missing (no silent fallback)', async () => {
    await expect(
      assertFFmpegAvailable('definitely-not-an-ffmpeg-binary-xyz'),
    ).rejects.toThrow(/FFmpeg is required/);
  });
});
