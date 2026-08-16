import { describe, expect, it } from 'vitest';
import { mkdir, writeFile, access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupWorkDir, isInside } from '../src/lib/temp.js';

describe('isInside', () => {
  it('accepts the root and children, rejects siblings and parents', () => {
    const root = 'C:\\worker-tmp';
    expect(isInside(root, 'C:\\worker-tmp')).toBe(true);
    expect(isInside(root, 'C:\\worker-tmp\\video-1')).toBe(true);
    expect(isInside(root, 'C:\\other')).toBe(false);
    expect(isInside(root, 'C:\\')).toBe(false);
    expect(isInside(root, 'C:\\worker-tmp-other')).toBe(false);
  });
});

describe('cleanupWorkDir', () => {
  it('removes a directory tree inside the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'avf-temp-test-'));
    const target = join(root, 'video-1');
    await mkdir(target);
    await writeFile(join(target, 'input.mp4'), 'data');

    const res = await cleanupWorkDir(target, root);
    expect(res.removed).toBe(true);
    await expect(access(target)).rejects.toThrow();
  });

  it('is a no-op for a missing directory (force cleanup)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'avf-temp-test-'));
    const res = await cleanupWorkDir(join(root, 'never-existed'), root);
    expect(res.removed).toBe(true);
  });

  it('refuses to delete anything outside the worker temp root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'avf-temp-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'avf-temp-outside-'));
    const victim = join(outside, 'user-notes.txt');
    await writeFile(victim, 'do not delete me');

    const res = await cleanupWorkDir(victim, root);
    expect(res.removed).toBe(false);
    expect(res.reason).toContain('outside');
    await expect(access(victim)).resolves.toBeUndefined();
  });
});
