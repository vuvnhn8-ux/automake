import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  startHeartbeat,
  setCurrentJob,
  getCurrentJob,
  type HeartbeatEntry,
  type HeartbeatStore,
} from '../src/lib/heartbeat.js';

function createFakeStore(): { store: HeartbeatStore; writes: HeartbeatEntry[] } {
  const writes: HeartbeatEntry[] = [];
  const store: HeartbeatStore = {
    write: async (entry) => {
      writes.push(entry);
    },
  };
  return { store, writes };
}

const INFO = {
  workerId: 'worker-1',
  hostname: 'home-pc',
  version: '1.2.3',
  concurrency: 1,
  ffmpegAvailable: true,
};

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('startHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes an ONLINE heartbeat immediately with identity fields', async () => {
    const { store, writes } = createFakeStore();
    startHeartbeat(INFO, { store, intervalMs: 1000 });
    await flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      ...INFO,
      status: 'ONLINE',
      currentJob: null,
    });
    expect(writes[0].lastSeenAt).toBeTruthy();
  });

  it('reports the current job from the tracker', async () => {
    const { store, writes } = createFakeStore();
    setCurrentJob('render-video:job-42');
    startHeartbeat(INFO, { store, intervalMs: 1000 });
    await flush();
    expect(writes[0].currentJob).toBe('render-video:job-42');
    expect(getCurrentJob()).toBe('render-video:job-42');
    setCurrentJob(null);
  });

  it('repeats on the configured interval', async () => {
    const { store, writes } = createFakeStore();
    startHeartbeat(INFO, { store, intervalMs: 1000 });
    await flush();
    const initial = writes.length;
    expect(initial).toBeGreaterThan(0);
    vi.advanceTimersByTime(2500);
    await flush();
    expect(writes.length).toBeGreaterThan(initial);
  });

  it('stop() writes OFFLINE and stops the interval', async () => {
    const { store, writes } = createFakeStore();
    const hb = startHeartbeat(INFO, { store, intervalMs: 1000 });
    await flush();
    vi.advanceTimersByTime(2000);
    await flush();

    await hb.stop('OFFLINE');
    await flush();
    expect(writes[writes.length - 1].status).toBe('OFFLINE');

    const afterStop = writes.length;
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(writes.length).toBe(afterStop);
  });

  it('stop() can mark DRAINING during graceful shutdown', async () => {
    const { store, writes } = createFakeStore();
    const hb = startHeartbeat(INFO, { store, intervalMs: 1000 });
    await flush();
    await hb.stop('DRAINING');
    await flush();
    expect(writes[writes.length - 1].status).toBe('DRAINING');
  });

  it('never lets a failed heartbeat write break the loop', async () => {
    const failing: HeartbeatStore = {
      write: async () => {
        throw new Error('db down');
      },
    };
    let hb:
      | {
          stop: (status?: 'ONLINE' | 'OFFLINE' | 'DRAINING') => Promise<void>;
        }
      | undefined;
    expect(() => {
      hb = startHeartbeat(INFO, { store: failing, intervalMs: 1000 });
    }).not.toThrow();
    await flush();
    await hb!.stop('OFFLINE');
    await flush();
  });
});
