import type { Prisma } from '@avf/database';
import { ChannelPlatformSchema, nextRunTime } from '@avf/shared';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas (shared by routes + unit tests)
// ---------------------------------------------------------------------------

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(200),
  platform: ChannelPlatformSchema.default('FACEBOOK'),
  description: z.string().max(2000).optional(),
  dailyVideoTarget: z.number().int().min(0).max(100).default(1),
  autoGenerationEnabled: z.boolean().default(false),
  isActive: z.boolean().default(true),
  distributionMode: z.enum(['SAME_CONTENT', 'CHANNEL_VARIANT']).default('SAME_CONTENT'),
  facebookPageId: z.string().uuid().nullable().optional(),
  publishingAccountId: z.string().uuid().nullable().optional(),
  credentials: z.record(z.string(), z.string()).optional(),
});

export const UpdateChannelSchema = CreateChannelSchema.partial();

export const ConnectChannelSchema = z
  .object({
    facebookPageId: z.string().uuid().nullable().optional(),
    publishingAccountId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.facebookPageId !== undefined || v.publishingAccountId !== undefined, {
    message: 'Provide facebookPageId or publishingAccountId',
  });

// ---------------------------------------------------------------------------
// Ownership (global registry): a channel belongs to the user directly, or to
// a project the user owns (legacy backfill rows with a creator projectId).
// ---------------------------------------------------------------------------

export function channelOwnershipWhere(userId: string): Prisma.PublishingChannelWhereInput {
  return { OR: [{ userId }, { project: { userId } }] };
}

export const ACTIVE_PUBLISH_STATUSES = ['PENDING', 'UPLOADING', 'PROCESSING'] as const;

export const PUBLISHABLE_VIDEO_STATUSES = ['READY', 'NEEDS_REVIEW'] as const;

export const PublishToChannelSchema = z.object({
  videoId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
  description: z.string().max(2200).optional(),
  confirm: z.boolean().optional(),
});

export function isVideoPublishable(status: string | null | undefined): boolean {
  return status != null && (PUBLISHABLE_VIDEO_STATUSES as readonly string[]).includes(status);
}

/**
 * Duplicate protection for manual publish. A video may only have one live job
 * per channel at a time; a previous successful publish also blocks a new job
 * unless the caller explicitly confirms a re-publish.
 */
export function publishingConflictFor(
  existing: { status: string }[],
): 'ACTIVE' | 'PUBLISHED' | null {
  if (existing.some((j) => (ACTIVE_PUBLISH_STATUSES as readonly string[]).includes(j.status))) {
    return 'ACTIVE';
  }
  if (existing.some((j) => j.status === 'PUBLISHED')) {
    return 'PUBLISHED';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Credential masking — credentials are AES-256-GCM encrypted at rest and are
// never returned by the API. Only a masked preview is ever exposed.
// ---------------------------------------------------------------------------

export function maskCredentials(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/** Strips raw credential columns from a DB channel row and adds a mask. */
export function toPublicChannel<
  T extends {
    credentials?: string | null;
    accessTokenEnc?: string | null;
  },
>(row: T) {
  const { credentials, accessTokenEnc, ...rest } = row;
  const secret = credentials ?? accessTokenEnc ?? '';
  return {
    ...rest,
    hasCredentials: Boolean(secret),
    credentialsMask: maskCredentials(secret),
  };
}

/** Non-secret fields that are safe to return to clients. */
export interface CredentialsSummary {
  appId?: string;
  pageName?: string;
  pageId?: string;
}

/**
 * Builds a summary from an already-decrypted credentials object. Only the
 * non-secret Facebook identity fields (appId / pageName / pageId) are exposed;
 * tokens and appSecrets are intentionally omitted.
 */
export function credentialsSummaryFrom(creds: Record<string, string> | undefined): CredentialsSummary | null {
  if (!creds) return null;
  const summary: CredentialsSummary = {};
  for (const key of ['appId', 'pageName', 'pageId'] as const) {
    const value = creds[key];
    if (typeof value === 'string' && value.trim().length > 0) summary[key] = value;
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

/**
 * Merges an incoming credentials patch over existing stored credentials.
 * A field is only overwritten when it carries a non-empty value; omitted or
 * blank fields keep the previously stored value (so editing pageId/appId alone
 * never wipes the stored appSecret / pageAccessToken).
 */
export function mergeCredentials(
  existing: Record<string, string> | undefined,
  incoming: Record<string, unknown> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...(existing ?? {}) };
  if (incoming) {
    for (const [key, value] of Object.entries(incoming)) {
      if (typeof value === 'string' && value.trim().length > 0) merged[key] = value;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Publishing-job planning. One finished video fans out to every enabled
// destination: SAME_CONTENT reuses the video for each channel (one job per
// channel so failures retry independently); CHANNEL_VARIANT marks the job as
// needing a per-channel localized variant before publish.
// ---------------------------------------------------------------------------

export type DistributionMode = 'SAME_CONTENT' | 'CHANNEL_VARIANT';

export interface AssignmentInput {
  publishingChannelId: string;
  enabled: boolean;
}

export interface VideoInput {
  videoId: string;
  projectId: string;
  contentId: string | null;
  platform: string;
}

export interface JobDescriptor {
  videoId: string;
  projectId: string;
  contentId: string | null;
  channelId: string;
  platform: string;
  distributionMode: DistributionMode;
  variantRequired: boolean;
}

export function planPublishingJobs(input: {
  videos: VideoInput[];
  assignments: AssignmentInput[];
  mode: DistributionMode;
}): JobDescriptor[] {
  const enabled = input.assignments.filter((a) => a.enabled);
  const jobs: JobDescriptor[] = [];
  for (const video of input.videos) {
    for (const assignment of enabled) {
      jobs.push({
        videoId: video.videoId,
        projectId: video.projectId,
        contentId: video.contentId,
        channelId: assignment.publishingChannelId,
        platform: video.platform,
        distributionMode: input.mode,
        variantRequired: input.mode === 'CHANNEL_VARIANT',
      });
    }
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// Schedule expansion. Reuses the DST-safe nextRunTime primitive to enumerate
// every matching wall-clock slot in a window (empty days = every day).
// ---------------------------------------------------------------------------

export function expandScheduleTimes(input: {
  times: string[];
  days: string[];
  timezone?: string;
  from: Date;
  to: Date;
}): Date[] {
  const { times, days, timezone } = input;
  const result: Date[] = [];
  let cursor = input.from;
  for (let guard = 0; guard < 10000; guard++) {
    const next = nextRunTime(times, days, cursor, timezone);
    if (!next || next.getTime() > input.to.getTime()) break;
    result.push(next);
    cursor = new Date(next.getTime() + 1);
  }
  return result;
}
