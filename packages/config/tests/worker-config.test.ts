import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../src/index.js';

/**
 * Loads the config module in isolation with controlled env vars. The real
 * module is a singleton computed at import time, so tests re-import it fresh
 * with only the env they specify (and a throwaway dotenv path so a local .env
 * cannot leak values in).
 */
async function loadConfig(extra: Record<string, string>): Promise<AppEnv> {
  const keys = [
    'ROLE',
    'WORKER_ID',
    'WORKER_CONCURRENCY',
    'WORKER_TEMP_DIR',
    'WORKER_HEARTBEAT_INTERVAL_MS',
    'WORKER_ARM_SCHEDULES',
    'DOTENV_CONFIG_PATH',
  ];
  const prev = new Map<string, string | undefined>();
  for (const k of keys) {
    prev.set(k, process.env[k]);
    delete process.env[k];
  }
  Object.assign(process.env, extra);
  process.env.DOTENV_CONFIG_PATH = 'C:\\__nonexistent_dotenv__.env';
  vi.resetModules();
  try {
    const mod = await import('../src/index.js');
    return mod.env as AppEnv;
  } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
  }
}

describe('worker configuration', () => {
  it('defaults WORKER_CONCURRENCY to 1 (conservative, sequential)', async () => {
    const env = await loadConfig({});
    expect(env.WORKER_CONCURRENCY).toBe(1);
  });

  it('reads WORKER_CONCURRENCY from the environment', async () => {
    const env = await loadConfig({ WORKER_CONCURRENCY: '4' });
    expect(env.WORKER_CONCURRENCY).toBe(4);
  });

  it('rejects non-positive concurrency', async () => {
    await expect(loadConfig({ WORKER_CONCURRENCY: '0' })).rejects.toThrow(/Invalid environment/);
    await expect(loadConfig({ WORKER_CONCURRENCY: '-2' })).rejects.toThrow(/Invalid environment/);
  });

  it('defaults WORKER_ID to empty (resolved to hostname at runtime)', async () => {
    const env = await loadConfig({});
    expect(env.WORKER_ID).toBe('');
  });

  it('reads WORKER_ID from the environment', async () => {
    const env = await loadConfig({ WORKER_ID: 'worker-7' });
    expect(env.WORKER_ID).toBe('worker-7');
  });

  it('defaults WORKER_TEMP_DIR to the platform temp dir + ai-video-worker', async () => {
    const env = await loadConfig({});
    expect(env.WORKER_TEMP_DIR).toMatch(/ai-video-worker$/);
  });

  it('reads WORKER_TEMP_DIR from the environment', async () => {
    const env = await loadConfig({ WORKER_TEMP_DIR: 'D:\\worker-tmp' });
    expect(env.WORKER_TEMP_DIR).toBe('D:\\worker-tmp');
  });

  it('defaults WORKER_HEARTBEAT_INTERVAL_MS to 15000', async () => {
    const env = await loadConfig({});
    expect(env.WORKER_HEARTBEAT_INTERVAL_MS).toBe(15000);
  });

  it('reads WORKER_HEARTBEAT_INTERVAL_MS from the environment', async () => {
    const env = await loadConfig({ WORKER_HEARTBEAT_INTERVAL_MS: '5000' });
    expect(env.WORKER_HEARTBEAT_INTERVAL_MS).toBe(5000);
  });

  it('defaults WORKER_ARM_SCHEDULES to true', async () => {
    const env = await loadConfig({});
    expect(env.WORKER_ARM_SCHEDULES).toBe(true);
  });

  it('honours WORKER_ARM_SCHEDULES=false', async () => {
    const env = await loadConfig({ WORKER_ARM_SCHEDULES: 'false' });
    expect(env.WORKER_ARM_SCHEDULES).toBe(false);
  });
});
