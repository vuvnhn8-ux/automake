import { describe, expect, it } from 'vitest';
import {
  CreateChannelSchema,
  UpdateChannelSchema,
  channelOwnershipWhere,
  maskCredentials,
  toPublicChannel,
  planPublishingJobs,
  expandScheduleTimes,
  type JobDescriptor,
} from '../src/lib/channels.js';

describe('global channel registry — create schema', () => {
  it('accepts a valid global create payload with sensible defaults', () => {
    const result = CreateChannelSchema.safeParse({ name: 'My channel' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.platform).toBe('FACEBOOK');
    expect(result.data.distributionMode).toBe('SAME_CONTENT');
    expect(result.data.dailyVideoTarget).toBe(1);
    expect(result.data.projectId).toBeUndefined();
  });

  it('accepts an explicit platform, variant mode and destination ids', () => {
    const result = CreateChannelSchema.safeParse({
      name: 'TT',
      platform: 'TIKTOK',
      distributionMode: 'CHANNEL_VARIANT',
      facebookPageId: '00000000-0000-4000-8000-000000000001',
      publishingAccountId: '00000000-0000-4000-8000-000000000002',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.platform).toBe('TIKTOK');
    expect(result.data.distributionMode).toBe('CHANNEL_VARIANT');
  });

  it('rejects an empty name and an unknown platform', () => {
    expect(CreateChannelSchema.safeParse({ name: '' }).success).toBe(false);
    expect(CreateChannelSchema.safeParse({ name: 'x', platform: 'SNAPCHAT' }).success).toBe(false);
  });

  it('accepts credentials as a string-keyed record', () => {
    const result = CreateChannelSchema.safeParse({
      name: 'FB Test',
      platform: 'FACEBOOK',
      credentials: { appId: '123', appSecret: 'secret', pageName: 'My Page', pageAccessToken: 'tok' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.credentials).toEqual({ appId: '123', appSecret: 'secret', pageName: 'My Page', pageAccessToken: 'tok' });
  });

  it('allows partial updates (UpdateChannelSchema)', () => {
    expect(UpdateChannelSchema.safeParse({}).success).toBe(true);
    expect(UpdateChannelSchema.safeParse({ name: 'renamed' }).success).toBe(true);
    expect(UpdateChannelSchema.safeParse({ name: '' }).success).toBe(false);
    expect(UpdateChannelSchema.safeParse({ distributionMode: 'CHANNEL_VARIANT' }).success).toBe(true);
  });
});

describe('global channel registry — ownership', () => {
  it('scopes a channel to its owning user or a creator project of that user', () => {
    expect(channelOwnershipWhere('user-1')).toEqual({
      OR: [{ userId: 'user-1' }, { project: { userId: 'user-1' } }],
    });
  });
});

describe('global channel registry — credential masking', () => {
  it('masks short secrets entirely', () => {
    expect(maskCredentials('short')).toBe('••••••••');
    expect(maskCredentials('')).toBe('');
  });

  it('masks long secrets keeping only the first 4 and last 4 chars', () => {
    const mask = maskCredentials('0123456789abcdef');
    expect(mask.startsWith('0123')).toBe(true);
    expect(mask.endsWith('cdef')).toBe(true);
    expect(mask).not.toBe('0123456789abcdef');
    expect(mask).toContain('••••');
  });

  it('strips raw credentials from the public channel view', () => {
    const publicView = toPublicChannel({
      id: 'ch-1',
      accessTokenEnc: 'ENCRYPTED-FACEBOOK-TOKEN',
      name: 'x',
    });
    expect(publicView).not.toHaveProperty('accessTokenEnc');
    expect(publicView.hasCredentials).toBe(true);
    expect(publicView.credentialsMask).toContain('••••');

    const accountView = toPublicChannel({
      id: 'acc-1',
      credentials: 'ENCRYPTED-ACCOUNT',
      name: 'y',
    });
    expect(accountView).not.toHaveProperty('credentials');
    expect(accountView.hasCredentials).toBe(true);
  });
});

describe('publishing job planning', () => {
  const videos = [
    { videoId: 'v1', projectId: 'p1', contentId: 'c1', platform: 'FACEBOOK' },
    { videoId: 'v2', projectId: 'p1', contentId: 'c2', platform: 'FACEBOOK' },
  ];

  it('SAME_CONTENT fans a video out to every enabled channel', () => {
    const jobs = planPublishingJobs({
      videos,
      assignments: [
        { publishingChannelId: 'a1', enabled: true },
        { publishingChannelId: 'a2', enabled: true },
      ],
      mode: 'SAME_CONTENT',
    });
    expect(jobs).toHaveLength(4); // 2 videos × 2 channels
    for (const job of jobs) {
      expect(job.variantRequired).toBe(false);
      expect(job.distributionMode).toBe('SAME_CONTENT');
    }
  });

  it('CHANNEL_VARIANT marks each destination job as variant-required', () => {
    const jobs = planPublishingJobs({
      videos: [videos[0]!],
      assignments: [{ publishingChannelId: 'a1', enabled: true }],
      mode: 'CHANNEL_VARIANT',
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.variantRequired).toBe(true);
    expect(jobs[0]!.distributionMode).toBe('CHANNEL_VARIANT');
  });

  it('skips disabled assignments', () => {
    const jobs = planPublishingJobs({
      videos: [videos[0]!],
      assignments: [
        { publishingChannelId: 'a1', enabled: false },
        { publishingChannelId: 'a2', enabled: true },
      ],
      mode: 'SAME_CONTENT',
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.channelId).toBe('a2');
  });

  it('each job carries the project, content and platform references', () => {
    const jobs = planPublishingJobs({
      videos: [videos[0]!],
      assignments: [{ publishingChannelId: 'a1', enabled: true }],
      mode: 'SAME_CONTENT',
    });
    const job = jobs[0] as JobDescriptor;
    expect(job.projectId).toBe('p1');
    expect(job.contentId).toBe('c1');
    expect(job.channelId).toBe('a1');
    expect(job.platform).toBe('FACEBOOK');
  });
});

describe('schedule expansion', () => {
  it('expands only the allowed weekdays', () => {
    const from = new Date(Date.UTC(2026, 0, 5)); // Monday
    const to = new Date(Date.UTC(2026, 0, 5, 23, 59, 59));
    const slots = expandScheduleTimes({
      times: ['09:00'],
      days: ['MONDAY', 'WEDNESDAY'],
      timezone: 'UTC',
      from,
      to,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.getUTCHours()).toBe(9);
    expect(slots[0]!.getUTCDate()).toBe(5);
  });

  it('treats empty days as every day', () => {
    const from = new Date(Date.UTC(2026, 0, 5));
    const to = new Date(Date.UTC(2026, 0, 7, 23, 59, 59));
    const slots = expandScheduleTimes({ times: ['09:00'], days: [], timezone: 'UTC', from, to });
    expect(slots).toHaveLength(3); // Mon, Tue, Wed
  });

  it('expands multiple times per day', () => {
    const from = new Date(Date.UTC(2026, 0, 5));
    const to = new Date(Date.UTC(2026, 0, 5, 23, 59, 59));
    const slots = expandScheduleTimes({
      times: ['09:00', '18:00'],
      days: ['MONDAY'],
      timezone: 'UTC',
      from,
      to,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0]!.getUTCHours()).toBe(9);
    expect(slots[1]!.getUTCHours()).toBe(18);
  });
});
