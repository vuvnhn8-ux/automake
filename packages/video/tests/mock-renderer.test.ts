import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { MockVideoRenderer } from '../src/mock-renderer.js';
import type { RenderRequest } from '../src/types.js';

const dirs: string[] = [];

afterAll(async () => {
  for (const d of dirs) {
    try {
      await import('node:fs/promises').then(({ rm }) => rm(d, { recursive: true, force: true }));
    } catch {
      /* noop */
    }
  }
});

describe('MockVideoRenderer', () => {
  it('writes a manifest with expected metadata', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'avf-render-'));
    dirs.push(workDir);
    const outputPath = join(workDir, 'out.mp4');

    const renderer = new MockVideoRenderer();
    const req: RenderRequest = {
      width: 1080,
      height: 1920,
      fps: 30,
      scenes: [
        { order: 1, durationSeconds: 5, subtitleText: 'Scene one' },
        { order: 2, durationSeconds: 5, subtitleText: 'Scene two' },
      ],
      subtitleStyle: {
        fontFamily: 'sans',
        fontSize: 46,
        color: '#fff',
        outlineColor: '#000',
        outlineWidth: 0,
        backgroundColor: '#000',
        backgroundOpacity: 0,
        position: 'bottom',
        animation: 'none',
      },
      outputPath,
      workDir,
    };

    const result = await renderer.render(req);
    expect(result.durationSeconds).toBe(10);
    expect(result.width).toBe(1080);
    expect(result.fps).toBe(30);

    const manifest = JSON.parse(await readFile(outputPath, 'utf8')) as {
      renderer: string;
      scenes: { order: number; subtitleText: string }[];
    };
    expect(manifest.renderer).toBe('mock');
    expect(manifest.scenes.length).toBe(2);
    expect(manifest.scenes[1]!.subtitleText).toBe('Scene two');
  });
});
