import { mkdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { env } from '@avf/config';

/**
 * Configurable root for all worker temporary files (render inputs/outputs,
 * publish materialization). Defaults to the platform temp dir + ai-video-worker.
 */
export function workerTempRoot(): string {
  return resolve(env.WORKER_TEMP_DIR);
}

export async function ensureTempRoot(): Promise<string> {
  const root = workerTempRoot();
  await mkdir(root, { recursive: true });
  return root;
}

/** True when `target` is `root` itself or strictly inside `root`. */
export function isInside(root: string, target: string): boolean {
  const base = resolve(root);
  const path = resolve(target);
  return path === base || path.startsWith(base + sep);
}

export interface CleanupResult {
  removed: boolean;
  path: string;
  reason?: string;
}

/**
 * Safely removes a worker temp directory (or file). Refuses to delete anything
 * outside WORKER_TEMP_DIR so unrelated user files are never touched. Called
 * after every job — success, failure, or retry exhaustion.
 */
export async function cleanupWorkDir(dir: string, root: string = workerTempRoot()): Promise<CleanupResult> {
  const target = resolve(dir);
  if (!isInside(root, target)) {
    return {
      removed: false,
      path: target,
      reason: `refusing to remove path outside worker temp root ${resolve(root)}`,
    };
  }
  try {
    await rm(target, { recursive: true, force: true });
    return { removed: true, path: target };
  } catch (err) {
    return {
      removed: false,
      path: target,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
