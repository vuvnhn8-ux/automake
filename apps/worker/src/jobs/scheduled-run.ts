import { prisma, Prisma } from '@avf/database';
import { nextRunTime, startOfDayInZone, formatRunDelayMs, selectTopic, normalizeCampaign } from '@avf/shared';
import type { WorkerContext } from '../context.js';
import { recordLog } from '../lib/status.js';

type TopicRecord = Prisma.TopicGetPayload<Record<string, never>>;

interface ScheduledRunPayload {
  scheduleId: string;
  projectId: string;
  runAt: string;
}

/** Re-arm the next scheduled run for an active schedule (idempotent jobId). */
export async function rearmSchedule(
  ctx: WorkerContext,
  schedule: { id: string; projectId: string; times: string[]; days: string[]; timezone: string | null; status: string },
): Promise<void> {
  if (schedule.status !== 'ACTIVE') return;
  const next = nextRunTime(schedule.times, schedule.days, new Date(), schedule.timezone ?? undefined);
  if (!next) return;
  const delayMs = formatRunDelayMs(next);
  await ctx.queue.add(
    'scheduled-run',
    { scheduleId: schedule.id, projectId: schedule.projectId, runAt: next.toISOString() },
    { delayMs, jobId: `scheduled-run-${schedule.id}-${next.toISOString().replace(/:/g, '-')}` },
  );
}

/** Arm all ACTIVE schedules that are not already armed for a future run. */
export async function armActiveSchedules(ctx: WorkerContext): Promise<void> {
  const schedules = await prisma.schedule.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, projectId: true, times: true, days: true, timezone: true, status: true, nextRunAt: true },
  });
  for (const schedule of schedules) {
    if (schedule.nextRunAt && schedule.nextRunAt.getTime() > Date.now()) continue;
    await rearmSchedule(ctx, schedule);
  }
}

/**
 * One scheduled slot fired. Picks the schedule's topic, or uses channel/series
 * topic selection, falling back to the project's first active topic. Creates a
 * fresh content record and runs the full pipeline.
 */
export async function handleScheduledRun(
  ctx: WorkerContext,
  payload: ScheduledRunPayload,
): Promise<void> {
  const { scheduleId, projectId } = payload;

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, projectId },
    include: { project: true, topic: true, channel: true },
  });
  if (!schedule) throw new Error('Schedule not found');
  if (schedule.status !== 'ACTIVE') return;

  // Per-campaign daily quota gate: skip when the campaign already generated its
  // dailyVideoTarget of content today (0 = unlimited). Campaign schedules also
  // only fire while the campaign is ACTIVE.
  if (schedule.campaignId) {
    const dayStart = startOfDayInZone(schedule.timezone ?? undefined);
    const [campaign, todayCount] = await Promise.all([
      prisma.contentCampaign.findUnique({ where: { id: schedule.campaignId } }),
      prisma.content.count({
        where: {
          campaignId: schedule.campaignId,
          createdAt: { gte: dayStart },
          status: { not: 'FAILED' },
        },
      }),
    ]);
    if (!campaign || campaign.status !== 'ACTIVE') {
      console.warn(`[schedule] ${scheduleId}: campaign ${schedule.campaignId} is not ACTIVE, skipping`);
      await rearmSchedule(ctx, schedule);
      return;
    }
    if (campaign.dailyVideoTarget > 0 && todayCount >= campaign.dailyVideoTarget) {
      console.warn(
        `[schedule] ${scheduleId}: campaign ${schedule.campaignId} reached daily quota (${todayCount}/${campaign.dailyVideoTarget}), skipping`,
      );
      await recordLog({
        projectId,
        jobType: 'CONTENT_GENERATION',
        provider: 'scheduler:quota-skip',
        requestId: scheduleId,
        error: `Daily quota reached (${todayCount}/${campaign.dailyVideoTarget})`,
      });
      await rearmSchedule(ctx, schedule);
      return;
    }
  }

  // Per-channel daily quota gate: skip when the channel already generated its
  // dailyVideoTarget of content today (0 = unlimited).
  if (schedule.channelId) {
    const dayStart = startOfDayInZone(schedule.timezone ?? undefined);
    const [channel, todayCount] = await Promise.all([
      prisma.publishingChannel.findUnique({ where: { id: schedule.channelId } }),
      prisma.content.count({
        where: {
          channelId: schedule.channelId,
          createdAt: { gte: dayStart },
          status: { not: 'FAILED' },
        },
      }),
    ]);
    if (channel && channel.dailyVideoTarget > 0 && todayCount >= channel.dailyVideoTarget) {
      console.warn(
        `[schedule] ${scheduleId}: channel ${schedule.channelId} reached daily quota (${todayCount}/${channel.dailyVideoTarget}), skipping`,
      );
      await recordLog({
        projectId,
        jobType: 'CONTENT_GENERATION',
        provider: 'scheduler:quota-skip',
        requestId: scheduleId,
        error: `Daily quota reached (${todayCount}/${channel.dailyVideoTarget})`,
      });
      await rearmSchedule(ctx, schedule);
      return;
    }
  }

  let topic: TopicRecord | null = schedule.topic;
  let channelId = schedule.channelId;
  let seriesId = schedule.seriesId;
  let source = 'project';

  if (!topic && seriesId) {
    const candidates = await prisma.topic.findMany({
      where: { seriesId, isActive: true },
    });
    const selection = selectTopic(candidates);
    if (selection) {
      topic = selection.topic as TopicRecord;
      source = 'series';
    }
  }

  if (!topic && schedule.campaignId) {
    const candidates = await prisma.topic.findMany({
      where: {
        isActive: true,
        series: { campaignId: schedule.campaignId },
      },
      orderBy: { lastUsedAt: 'asc' },
    });
    const selection = selectTopic(candidates);
    if (selection) {
      topic = selection.topic as TopicRecord;
      source = 'campaign';
    }
  }

  if (!topic && channelId) {
    const candidates = await prisma.topic.findMany({
      where: { projectId, isActive: true },
      orderBy: { lastUsedAt: 'asc' },
    });
    const selection = selectTopic(candidates);
    if (selection) {
      topic = selection.topic as TopicRecord;
      source = 'channel';
    }
  }

  if (!topic) {
    topic = await prisma.topic.findFirst({
      where: { projectId, isActive: true },
      orderBy: { lastUsedAt: 'asc' },
    });
    source = 'project';
  }
  if (!topic) {
    console.warn(`[schedule] ${scheduleId}: project has no active topic, skipping`);
    return;
  }

  const topicId = topic.id;
  const content = await prisma.content.create({
    data: {
      projectId,
      topicId,
      campaignId: schedule.campaignId ?? null,
      channelId: channelId ?? null,
      seriesId: seriesId ?? null,
      title: `Auto: ${topic.name}`,
      status: 'GENERATING',
    },
  });

  const campaign = schedule.campaignId
    ? await prisma.contentCampaign.findUnique({ where: { id: schedule.campaignId } })
    : null;
  const language = normalizeCampaign(campaign)?.contentProfile?.language ?? schedule.project?.language ?? null;

  await ctx.queue.add('generate-content', {
    contentId: content.id,
    projectId,
    topicId,
    campaignId: schedule.campaignId ?? undefined,
    channelId: channelId ?? undefined,
    seriesId: seriesId ?? undefined,
    language: language ?? undefined,
  });

  const next = nextRunTime(schedule.times, schedule.days, new Date(), schedule.timezone ?? undefined);
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { lastRunAt: new Date(), nextRunAt: next },
  });

  await prisma.topic.update({
    where: { id: topicId },
    data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
  });

  await rearmSchedule(ctx, schedule);

  await recordLog({
    projectId,
    contentId: content.id,
    jobType: 'CONTENT_GENERATION',
    provider: `scheduler:${source}`,
    requestId: scheduleId,
  });
}
