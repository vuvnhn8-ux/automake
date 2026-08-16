import { prisma } from '@avf/database';
import { getTelegramConfig, getTelegramBotToken, sendTelegramMessage } from '@avf/config';
import type { WorkerContext } from '../context.js';

interface TelegramReportPayload {
  date: string;
  timezone?: string;
}

export function startOfDayInZone(timezone: string, now = new Date()): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? 0 : Number(parts.hour) || 0;
  const minute = Number(parts.minute) || 0;
  const second = Number(parts.second) || 0;
  const elapsedLocalMs = (hour * 3600 + minute * 60 + second) * 1000;
  return new Date(now.getTime() - elapsedLocalMs);
}

/**
 * Builds and sends the daily publishing report to the configured Telegram chat.
 * The report covers the last 24h of activity: content generated, videos
 * rendered, and publishing jobs by status.
 */
export async function handleTelegramDailyReport(
  ctx: WorkerContext,
  payload: TelegramReportPayload,
): Promise<void> {
  const config = await getTelegramConfig();
  if (!config.configured || !config.chatId || !config.dailyReportEnabled) {
    console.log('[telegram] daily report disabled or not configured, skipping');
    return;
  }
  const timezone = config.timezone ?? payload.timezone ?? 'Asia/Tokyo';
  const since = startOfDayInZone(timezone);

  const [contentCount, contentFailed, videosReady, jobs] = await Promise.all([
    prisma.content.count({ where: { createdAt: { gte: since } } }),
    prisma.content.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
    prisma.video.count({ where: { createdAt: { gte: since }, status: { in: ['READY', 'RENDERING'] } } }),
    prisma.publishingJob.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true },
    }),
  ]);

  const byStatus = new Map<string, number>();
  for (const job of jobs) byStatus.set(job.status, (byStatus.get(job.status) ?? 0) + 1);
  const published = byStatus.get('PUBLISHED') ?? 0;
  const pending = byStatus.get('PENDING') ?? 0;
  const processing = byStatus.get('PROCESSING') ?? 0;
  const failed = byStatus.get('FAILED') ?? 0;

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  const lines = [
    `📊 *Automake · Daily report — ${dateLabel}*`,
    '',
    `• Content generated: ${contentCount}${contentFailed ? ` (${contentFailed} failed)` : ''}`,
    `• Videos rendered: ${videosReady}`,
    '',
    `• Publishing jobs: ${jobs.length}`,
    `   - Published: ${published}`,
    `   - Processing: ${processing}`,
    `   - Pending: ${pending}`,
    failed ? `   - Failed: ${failed}` : '',
  ].filter(Boolean);

  const token = await getTelegramBotToken();
  const result = await sendTelegramMessage(token, config.chatId, lines.join('\n'));
  console.log(`[telegram] daily report sent: ok=${result.ok}${result.message ? ` · ${result.message}` : ''}`);
}

/**
 * Arm the daily report as a delayed job (idempotent jobId for today). Re-armed
 * on every worker boot so a transient Redis outage self-heals.
 */
export async function armDailyReport(ctx: WorkerContext): Promise<void> {
  const config = await getTelegramConfig();
  if (!config.configured || !config.dailyReportEnabled) return;
  const timezone = config.timezone ?? 'Asia/Tokyo';
  const reportTime = config.reportTime ?? '07:00';

  const now = new Date();
  const target = nextReportTime(reportTime, timezone, now);
  const delayMs = Math.max(0, target.getTime() - now.getTime());
  const jobId = `telegram-daily-report:${target.toISOString()}`;

  await ctx.queue.add(
    'telegram-daily-report',
    { date: target.toISOString(), timezone },
    { delayMs, jobId },
  );
  console.log(
    `[telegram] daily report armed for ${target.toISOString()} (in ${Math.round(delayMs / 60_000)} min)`,
  );
}

export function nextReportTime(reportTime: string, timezone: string, now = new Date()): Date {
  const [hourRaw, minuteRaw] = reportTime.split(':');
  const hour = Number.parseInt(hourRaw ?? '', 10);
  const minute = Number.parseInt(minuteRaw ?? '', 10);
  const today = startOfDayInZone(timezone, now);
  const candidate = new Date(today.getTime() + ((Number.isNaN(hour) ? 7 : hour) * 60 + (Number.isNaN(minute) ? 0 : minute)) * 60_000);
  return candidate.getTime() > now.getTime() ? candidate : new Date(candidate.getTime() + 24 * 60 * 60_000);
}
