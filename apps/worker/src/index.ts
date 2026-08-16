import { createWorkerContext } from './context.js';
import { loadProviderConfig, env } from '@avf/config';
import { handleGenerateContent } from './jobs/generate-content.js';
import { handleGenerateScenes } from './jobs/generate-scenes.js';
import {
  handleGenerateImage,
  handleGenerateVideo,
  handleGenerateVoice,
} from './jobs/generate-media.js';
import { handleRenderVideo } from './jobs/render-video.js';
import { handleQualityCheck } from './jobs/quality-check.js';
import { handlePublishVideo } from './jobs/publish-video.js';
import { handleScheduledRun, armActiveSchedules } from './jobs/scheduled-run.js';
import { handleTelegramDailyReport, armDailyReport } from './jobs/telegram-daily-report.js';
import { assertFFmpegAvailable } from './lib/ffmpeg.js';
import { ensureTempRoot } from './lib/temp.js';
import { resolveWorkerId, resolveWorkerHostname, resolveWorkerVersion } from './lib/identity.js';
import { startHeartbeat, setCurrentJob, getCurrentJob } from './lib/heartbeat.js';
import type { JobContext } from '@avf/queue';

type JobHandlerFn = (payload: unknown, jctx: JobContext) => Promise<void>;

/** Wraps a handler with lifecycle logging + heartbeat current-job tracking. */
function withLifecycle(name: string, handler: JobHandlerFn): JobHandlerFn {
  return async (payload, jctx) => {
    setCurrentJob(`${name}:${jctx.jobId}`);
    console.log(`[worker] job started   ${name}(${jctx.jobId}) attempt=${jctx.attempt}`);
    try {
      await handler(payload, jctx);
      console.log(`[worker] job completed ${name}(${jctx.jobId}) attempt=${jctx.attempt}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[worker] job failed    ${name}(${jctx.jobId}) attempt=${jctx.attempt}: ${message}`,
      );
      throw err;
    } finally {
      setCurrentJob(null);
    }
  };
}

async function main(): Promise<void> {
  const workerId = resolveWorkerId();
  const hostname = resolveWorkerHostname();
  const version = resolveWorkerVersion();
  const concurrency = env.WORKER_CONCURRENCY;

  const ctx = createWorkerContext();
  await loadProviderConfig();

  // Fail fast when real rendering is required but FFmpeg is missing. The mock
  // renderer remains available via RENDER_DRIVER=mock for development/testing.
  let ffmpegAvailable = false;
  if (env.RENDER_DRIVER === 'ffmpeg') {
    ffmpegAvailable = await assertFFmpegAvailable(env.FFMPEG_PATH);
  } else {
    console.log('[worker] RENDER_DRIVER=mock · ffmpeg not required (development/testing only)');
  }

  await ensureTempRoot();

  ctx.queue.registerHandler('generate-content', withLifecycle('generate-content', (p, c) =>
    handleGenerateContent(ctx, p as never),
  ));
  ctx.queue.registerHandler('generate-scenes', withLifecycle('generate-scenes', (p, c) =>
    handleGenerateScenes(ctx, p as never),
  ));
  ctx.queue.registerHandler('generate-image', withLifecycle('generate-image', (p, c) =>
    handleGenerateImage(ctx, p as never),
  ));
  ctx.queue.registerHandler('generate-video', withLifecycle('generate-video', (p, c) =>
    handleGenerateVideo(ctx, p as never),
  ));
  ctx.queue.registerHandler('generate-voice', withLifecycle('generate-voice', (p, c) =>
    handleGenerateVoice(ctx, p as never),
  ));
  ctx.queue.registerHandler('render-video', withLifecycle('render-video', (p, c) =>
    handleRenderVideo(ctx, p as never),
  ));
  ctx.queue.registerHandler('quality-check', withLifecycle('quality-check', (p, c) =>
    handleQualityCheck(ctx, p as never),
  ));
  ctx.queue.registerHandler('publish-video', withLifecycle('publish-video', (p, c) =>
    handlePublishVideo(ctx, p as never),
  ));
  ctx.queue.registerHandler('scheduled-run', withLifecycle('scheduled-run', (p, c) =>
    handleScheduledRun(ctx, p as never),
  ));
  ctx.queue.registerHandler('telegram-daily-report', withLifecycle('telegram-daily-report', (p, c) =>
    handleTelegramDailyReport(ctx, p as never),
  ));

  await ctx.queue.start();

  // Scheduler role (idempotent via stable jobIds). A transient Redis outage at
  // boot must not kill the worker — arming is retried on the next restart and
  // after every scheduled run, so a single miss is self-healing.
  if (env.WORKER_ARM_SCHEDULES) {
    try {
      await armActiveSchedules(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[worker] schedule arming deferred (Redis may be offline): ${message}`);
    }
  }

  try {
    await armDailyReport(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[worker] telegram daily report arming deferred: ${message}`);
  }

  console.log(
    `[worker] started · id=${workerId} · host=${hostname} · version=${version} · ` +
      `queue=${ctx.queue.driver} · redis=${env.REDIS_URL} · concurrency=${concurrency} · ` +
      `render=${env.RENDER_DRIVER} · ffmpeg=${ffmpegAvailable ? 'yes' : 'no'} · ` +
      `temp=${env.WORKER_TEMP_DIR}`,
  );

  const heartbeat = startHeartbeat({
    workerId,
    hostname,
    version,
    concurrency,
    ffmpegAvailable,
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received, draining queues…`);
    // Tell the control plane we are draining, stop accepting new jobs, then
    // mark OFFLINE once the queue (active jobs) is closed.
    await heartbeat.stop('DRAINING');
    try {
      await ctx.queue.close();
    } catch (err) {
      console.warn(`[worker] error while closing queue: ${err instanceof Error ? err.message : String(err)}`);
    }
    await heartbeat.stop('OFFLINE');
    console.log('[worker] shutdown complete');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
