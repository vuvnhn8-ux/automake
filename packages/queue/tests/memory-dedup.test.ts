import { describe, expect, it } from 'vitest';
import { InMemoryQueueProvider } from '../src/memory.js';

/**
 * Distributed-worker guarantees that apply regardless of the driver:
 *  - stable jobIds deduplicate jobs (no double processing when multiple
 *    producers/workers re-enqueue the same logical job);
 *  - handlers are invoked exactly once per accepted job.
 */
describe('queue job deduplication', () => {
  it('returns the existing job id when the same jobId is added twice', async () => {
    const provider = new InMemoryQueueProvider();
    const a = await provider.add(
      'publish-video',
      { publishingJobId: 'p1', videoId: 'v1', projectId: 'pr1' },
      { jobId: 'publish:p1' },
    );
    const b = await provider.add(
      'publish-video',
      { publishingJobId: 'p1', videoId: 'v1', projectId: 'pr1' },
      { jobId: 'publish:p1' },
    );
    expect(a).toBe(b);
    expect(a).toBe('publish:p1');
  });

  it('runs a deduplicated job exactly once', async () => {
    const provider = new InMemoryQueueProvider();
    let runs = 0;
    provider.registerHandler('publish-video', async () => {
      runs += 1;
    });
    await provider.add(
      'publish-video',
      { publishingJobId: 'p1', videoId: 'v1', projectId: 'pr1' },
      { jobId: 'publish:p1' },
    );
    await provider.add(
      'publish-video',
      { publishingJobId: 'p1', videoId: 'v1', projectId: 'pr1' },
      { jobId: 'publish:p1' },
    );
    await provider.start();
    await flush();
    expect(runs).toBe(1);
  });

  it('runs distinct jobs independently', async () => {
    const provider = new InMemoryQueueProvider();
    const runs = new Set<string>();
    provider.registerHandler('publish-video', async (_payload, ctx) => {
      runs.add(ctx.jobId);
    });
    await provider.add(
      'publish-video',
      { publishingJobId: 'p1', videoId: 'v1', projectId: 'pr1' },
      { jobId: 'publish:p1' },
    );
    await provider.add(
      'publish-video',
      { publishingJobId: 'p2', videoId: 'v1', projectId: 'pr1' },
      { jobId: 'publish:p2' },
    );
    await provider.start();
    await flush();
    expect([...runs].sort()).toEqual(['publish:p1', 'publish:p2']);
  });
});

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}
