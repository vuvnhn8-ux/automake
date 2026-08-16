import { prisma } from '@avf/database';
import { env } from '@avf/config';

export type WorkerStatus = 'ONLINE' | 'OFFLINE' | 'DRAINING';

export interface HeartbeatEntry {
  workerId: string;
  hostname: string;
  status: WorkerStatus;
  currentJob: string | null;
  version: string;
  concurrency: number;
  ffmpegAvailable: boolean;
  lastSeenAt: string;
}

export interface HeartbeatStore {
  write(entry: HeartbeatEntry): Promise<void>;
}

/** Default store: WorkerHeartbeat table (same database as the control plane). */
export function createPrismaHeartbeatStore(): HeartbeatStore {
  return {
    async write(entry) {
      await prisma.workerHeartbeat.upsert({
        where: { workerId: entry.workerId },
        create: { ...entry, lastSeenAt: new Date(entry.lastSeenAt) },
        update: { ...entry, lastSeenAt: new Date(entry.lastSeenAt) },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Current-job tracker (process-global; used for heartbeat + shutdown logging)
// ---------------------------------------------------------------------------

let currentJob: string | null = null;

export function setCurrentJob(job: string | null): void {
  currentJob = job;
}

export function getCurrentJob(): string | null {
  return currentJob;
}

// ---------------------------------------------------------------------------
// Heartbeat loop
// ---------------------------------------------------------------------------

export interface HeartbeatOptions {
  intervalMs?: number;
  store?: HeartbeatStore;
  getCurrentJob?: () => string | null;
}

export interface HeartbeatHandle {
  /** Final heartbeat (default OFFLINE), clears the interval. Best-effort. */
  stop(status?: WorkerStatus): Promise<void>;
}

export function startHeartbeat(
  info: Omit<HeartbeatEntry, 'status' | 'currentJob' | 'lastSeenAt'>,
  opts: HeartbeatOptions = {},
): HeartbeatHandle {
  const store = opts.store ?? createPrismaHeartbeatStore();
  const intervalMs = opts.intervalMs ?? env.WORKER_HEARTBEAT_INTERVAL_MS;
  const getJob = opts.getCurrentJob ?? getCurrentJob;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const beat = async (status: WorkerStatus, current: string | null): Promise<void> => {
    if (stopped && status === 'ONLINE') return;
    try {
      await store.write({
        ...info,
        status,
        currentJob: current,
        lastSeenAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[worker] heartbeat write failed:', err);
    }
  };

  timer = setInterval(() => void beat('ONLINE', getJob()), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  void beat('ONLINE', getJob());

  return {
    async stop(status: WorkerStatus = 'OFFLINE'): Promise<void> {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await beat(status, null);
    },
  };
}
