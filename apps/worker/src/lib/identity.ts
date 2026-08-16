import { hostname as osHostname } from 'node:os';
import { env } from '@avf/config';

/**
 * Stable identity for this worker process. Defaults to the OS hostname so the
 * row is stable across restarts on one machine. Override with WORKER_ID when
 * multiple workers share a hostname (containers, duplicate hostnames).
 */
export function resolveWorkerId(): string {
  return env.WORKER_ID || osHostname();
}

export function resolveWorkerHostname(): string {
  return osHostname();
}

/**
 * Reported worker version. Falls back to npm_package_version (set when run
 * through npm scripts) then a static default; override with WORKER_VERSION.
 */
export function resolveWorkerVersion(): string {
  return process.env.WORKER_VERSION ?? process.env.npm_package_version ?? '0.1.0';
}
