import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@avf/database';
import { createVideoRenderer, runFFmpeg } from '@avf/video';
import type { WorkerContext } from '../context.js';
import { recordLog, failVideo, shortMessage } from '../lib/status.js';

interface QualityCheckPayload {
  videoId: string;
  projectId: string;
}

interface QaReport {
  playable: boolean;
  renderer: string;
  durationSeconds?: number;
  resolution?: string;
  fps?: number;
  subtitleCount?: number;
  log?: string;
  message?: string;
}

/**
 * Quality gate. With the mock renderer the report is assembled from the stored
 * manifest; with FFmpeg we probe the MP4 to confirm it decodes cleanly.
 * A low score downgrades the video to NEEDS_REVIEW. FULL_AUTOMATIC projects
 * are published right after QA passes.
 */
export async function handleQualityCheck(
  ctx: WorkerContext,
  payload: QualityCheckPayload,
): Promise<void> {
  const { videoId, projectId } = payload;
  const started = Date.now();

  const video = await prisma.video.findFirst({
    where: { id: videoId, projectId },
    include: {
      content: { include: { scenes: true } },
      project: true,
    },
  });
  if (!video) throw new Error('Video not found');

  try {
    const renderer = createVideoRenderer();
    let report: QaReport;

    if (renderer.name === 'mock') {
      report = { playable: true, renderer: 'mock' };
      if (video.fileKey) {
        try {
          const buf = await ctx.storage.get(video.fileKey);
          const manifest = JSON.parse(buf.toString('utf8')) as {
            durationSeconds?: number;
            scenes?: { subtitleText?: string }[];
            log?: string;
          };
          report.durationSeconds = manifest.durationSeconds;
          report.subtitleCount = (manifest.scenes ?? []).filter((s) => s.subtitleText).length;
          report.log = manifest.log;
          report.message = 'Mock renderer: no real playability probe performed.';
        } catch (err) {
          report.playable = false;
          report.message = shortMessage(err);
        }
      }
    } else if (video.fileKey) {
      const workDir = join(process.env.RENDER_WORK_DIR ?? 'data/render', 'qa');
      await mkdir(workDir, { recursive: true });
      const probePath = join(workDir, `${videoId}.mp4`);
      const buf = await ctx.storage.get(video.fileKey);
      await writeFile(probePath, buf);
      const result = await runFFmpeg(['-v', 'error', '-i', probePath, '-f', 'null', '-'], 120000);
      report = {
        playable: result.code === 0,
        renderer: 'ffmpeg',
        log: result.stderr.slice(-2000),
        durationSeconds: video.durationSeconds ?? undefined,
        resolution: video.resolution,
        fps: video.fps,
      };
    } else {
      report = { playable: false, renderer: renderer.name, message: 'No video file on record' };
    }

    // Heuristic score: playable base 90, penalty for missing assets.
    let score = 90;
    if (!report.playable) score -= 40;
    if (!video.fileKey) score -= 20;
    if (video.content?.scenes.length === 0) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const status = report.playable && score >= 60 ? 'READY' : 'NEEDS_REVIEW';
    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        status,
        qualityScore: score,
        qaResult: { report } as never,
        errorMessage: report.playable ? null : 'QA failed',
      },
    });

    await recordLog({
      projectId,
      contentId: video.contentId,
      videoId,
      jobType: 'QUALITY_CHECK',
      provider: renderer.name,
      durationMs: Date.now() - started,
    });

    // FULL_AUTOMATIC: publish as soon as QA passes.
    if (status === 'READY') {
      // Campaign flow: create one publication job per enabled assignment so
      // destinations fail and retry independently.
      if (video.content?.campaignId) {
        const campaign = await prisma.contentCampaign.findUnique({
          where: { id: video.content.campaignId },
        });
        const automation = (campaign?.automation ?? {}) as { autoPublish?: boolean };
        if (campaign && campaign.status === 'ACTIVE' && automation.autoPublish) {
          const assignments = await prisma.campaignChannelAssignment.findMany({
            where: { campaignId: campaign.id, enabled: true },
            include: { channel: { select: { id: true, isActive: true, platform: true } } },
          });
          for (const assignment of assignments) {
            if (!assignment.channel.isActive) continue;
            const publishingJob = await prisma.publishingJob.create({
              data: {
                videoId,
                projectId: video.projectId,
                contentId: video.contentId,
                campaignId: campaign.id,
                channelId: assignment.publishingChannelId,
                platform: assignment.channel.platform,
                facebookPageId: null,
                descriptionOverride: assignment.captionInstructions ?? null,
                status: 'PENDING',
              },
            });
            await ctx.queue.add('publish-video', {
              publishingJobId: publishingJob.id,
              videoId,
              projectId,
            });
          }
        }
      } else if (video.project.publishingMode === 'FULL_AUTOMATIC') {
        // Project flow: publish to every enabled channel assigned to this
        // project. One video -> N publishing jobs (one per destination), so
        // each channel fails and retries independently. The project's
        // dailyVideoTarget is the generation quota; destinations all receive
        // the same video.
        const assignments = await prisma.projectChannelAssignment.findMany({
          where: { projectId, enabled: true, channel: { isActive: true } },
          select: { publishingChannelId: true, channel: { select: { id: true, platform: true } } },
        });
        if (assignments.length > 0) {
          for (const assignment of assignments) {
            const publishingJob = await prisma.publishingJob.create({
              data: {
                videoId,
                projectId: video.projectId,
                contentId: video.contentId,
                channelId: assignment.publishingChannelId,
                platform: assignment.channel.platform,
                status: 'PENDING',
              },
            });
            await ctx.queue.add('publish-video', {
              publishingJobId: publishingJob.id,
              videoId,
              projectId,
            });
          }
          return;
        }
        const page = video.project.facebookPageId
          ? await prisma.facebookPage.findFirst({
              where: { id: video.project.facebookPageId, status: 'CONNECTED' },
            })
          : null;
        if (page) {
          const publishingJob = await prisma.publishingJob.create({
            data: {
              videoId,
              projectId: video.projectId,
              contentId: video.contentId,
              facebookPageId: page.id,
              platform: 'FACEBOOK',
              status: 'PENDING',
            },
          });
          await ctx.queue.add('publish-video', {
            publishingJobId: publishingJob.id,
            videoId,
            projectId,
          });
        }
      }
    }

    void updated;
  } catch (err) {
    const message = shortMessage(err);
    await failVideo(videoId, message);
    throw err;
  }
}
