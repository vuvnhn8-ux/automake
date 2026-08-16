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
