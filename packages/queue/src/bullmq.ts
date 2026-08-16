import { Queue, Worker } from 'bullmq';
import { env } from '@avf/config';
import { JobNameSchema } from '@avf/shared';
import type { AddJobOptions, JobHandler, QueueProvider } from './types.js';
import { queueForJob, validateJobPayload } from './types.js';

const QUEUE_NAMES = ['content', 'scene', 'media', 'render', 'publish', 'schedule', 'qa'];

/**
 * Redis connection used by both Queue (producer) and Worker (consumer).
 *
 * `maxRetriesPerRequest: null` is required for BullMQ workers: it disables
 * ioredis' per-command retry cap so a transient Redis/network outage never
 * permanently kills a worker with a MaxRetriesPerRequestError. ioredis keeps
 * the socket alive and reconnects automatically (and BullMQ re-registers its
 * blocking consumer after reconnect), so the worker recovers on its own when
 * the VPS becomes reachable again.
 */
function redisConnection(): { url: string; maxRetriesPerRequest: null } {
  return { url: env.REDIS_URL, maxRetriesPerRequest: null };
}

/**
 * Redis-backed queue driver using BullMQ. This is the production driver; the
 * scheduler relies on BullMQ delayed jobs (never setTimeout).
 */
export class BullMQQueueProvider implements QueueProvider {
  readonly driver = 'bullmq' as const;

  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly handlers = new Map<string, JobHandler>();

  constructor() {
    this.queues = new Map();
    for (const name of QUEUE_NAMES) {
      const queue = new Queue(name, { connection: redisConnection() });
      queue.on('error', (err) => {
        console.error(`[queue] ${name} connection error: ${err.message} (reconnecting…)`);
      });
      this.queues.set(name, queue);
    }
  }

  async add(jobName: string, payload: Record<string, unknown>, opts?: AddJobOptions): Promise<string> {
    validateJobPayload(jobName, payload);
    JobNameSchema.parse(jobName);
    const queue = this.queues.get(queueForJob(jobName));
    if (!queue) {
      throw new Error(`No queue for job ${jobName}`);
    }
    const job = await queue.add(jobName, payload, {
      jobId: opts?.jobId,
      delay: opts?.delayMs ?? 0,
      attempts: opts?.attempts ?? env.MAX_RETRIES + 1,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return job.id ?? '';
  }

  registerHandler(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler);
  }

  async start(): Promise<void> {
    const concurrency = env.WORKER_CONCURRENCY;
    for (const [queueName] of this.queues) {
      const worker = new Worker(
        queueName,
        async (job) => {
          const handler = this.handlers.get(job.name);
          if (!handler) {
            throw new Error(`No handler registered for job ${job.name}`);
          }
          await handler(job.data as Record<string, unknown>, {
            jobName: job.name,
            jobId: job.id ?? '',
            attempt: (job.attemptsMade ?? 0) + 1,
            raw: job,
          });
        },
        {
          connection: redisConnection(),
          concurrency,
        },
      );
      worker.on('ready', () => {
        console.log(`[queue] worker ready · queue=${queueName} · concurrency=${concurrency} · redis=${env.REDIS_URL}`);
      });
      worker.on('failed', (job, err) => {
        if (job) {
          console.error(`[queue] job failed ${job.name}(${job.id}): ${err.message}`);
        }
      });
      worker.on('error', (err) => {
        console.error(`[queue] worker error on ${queueName}: ${err.message} (will keep reconnecting)`);
      });
      worker.on('closed', () => {
        console.log(`[queue] worker closed · queue=${queueName}`);
      });
      this.workers.push(worker);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
