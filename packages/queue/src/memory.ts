import { randomUUID } from 'node:crypto';
import { JobNameSchema } from '@avf/shared';
import type { AddJobOptions, JobContext, JobHandler, QueueProvider } from './types.js';
import { validateJobPayload } from './types.js';

interface MemoryJob {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  runAt: number;
  attempt: number;
  timer?: NodeJS.Timeout;
}

/**
 * In-process queue for local development when Redis is unavailable.
 * Not a substitute for BullMQ in production — the scheduler still fires jobs
 * through the same provider interface, so swapping QUEUE_DRIVER=bullmq needs
 * no code changes. In-memory jobs are lost on restart (dev only).
 */
export class InMemoryQueueProvider implements QueueProvider {
  readonly driver = 'memory' as const;

  private readonly handlers = new Map<string, JobHandler>();
  private readonly jobs = new Map<string, MemoryJob>();
  private started = false;
  private closed = false;

  async add(jobName: string, payload: Record<string, unknown>, opts?: AddJobOptions): Promise<string> {
    validateJobPayload(jobName, payload);
    JobNameSchema.parse(jobName);
    const id = opts?.jobId ?? randomUUID();
    if (this.jobs.has(id)) {
      return id;
    }
    const runAt = Date.now() + (opts?.delayMs ?? 0);
    const job: MemoryJob = { id, name: jobName, payload, runAt, attempt: 0 };
    this.jobs.set(id, job);
    if (this.started) {
      this.schedule(job);
    }
    return id;
  }

  registerHandler(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
  }

  async start(): Promise<void> {
    this.started = true;
    for (const job of [...this.jobs.values()]) {
      this.schedule(job);
    }
  }

  private schedule(job: MemoryJob): void {
    const delay = Math.max(0, job.runAt - Date.now());
    job.timer = setTimeout(() => void this.run(job), delay);
  }

  private async run(job: MemoryJob): Promise<void> {
    if (this.closed) return;
    const handler = this.handlers.get(job.name);
    if (!handler) {
      console.warn(`[queue] no handler for job ${job.name}, skipping`);
      return;
    }
    job.attempt += 1;
    const ctx: JobContext = { jobName: job.name, jobId: job.id, attempt: job.attempt, raw: null };
    try {
      await handler(job.payload, ctx);
    } catch (err) {
      console.error(`[queue] job ${job.name}(${job.id}) failed:`, err);
      // Simple retry with exponential backoff for the memory driver.
      const attempts = (job.payload as { _maxAttempts?: number })._maxAttempts ?? 1;
      if (job.attempt < attempts) {
        const backoff = 1000 * 2 ** job.attempt;
        job.runAt = Date.now() + backoff;
        this.schedule(job);
        return;
      }
    } finally {
      this.jobs.delete(job.id);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) {
      if (job.timer) clearTimeout(job.timer);
    }
    this.jobs.clear();
  }
}
