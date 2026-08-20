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
  publishingConflictFor,
  isVideoPublishable,
  PublishToChannelSchema,
  credentialsSummaryFrom,
  mergeCredentials,
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

describe('credential merging (PATCH safety)', () => {
  it('keeps existing secrets when incoming fields are omitted or blank', () => {
    const existing = { appId: '123', appSecret: 'sec', pageName: 'P', pageId: '1', pageAccessToken: 'tok' };
    const merged = mergeCredentials(existing, { pageId: '2', pageAccessToken: '' });
    expect(merged.pageId).toBe('2');
    expect(merged.pageAccessToken).toBe('tok');
    expect(merged.appSecret).toBe('sec');
  });

  it('overwrites a secret only when a non-empty new value is provided', () => {
    const existing = { appId: '123', pageAccessToken: 'old-tok' };
    const merged = mergeCredentials(existing, { pageAccessToken: 'new-tok' });
    expect(merged.pageAccessToken).toBe('new-tok');
  });

  it('starts a fresh record from the incoming patch when nothing existed', () => {
    const merged = mergeCredentials(undefined, { pageId: 'x', pageName: 'P' });
    expect(merged).toEqual({ pageId: 'x', pageName: 'P' });
  });

  it('returns only scaled fields chosen by the caller (no secrets)', () => {
    const merged = mergeCredentials(undefined, { appId: 'a', appSecret: 's', pageAccessToken: 't' });
    expect(merged.appSecret).toBe('s');
    expect(merged.pageAccessToken).toBe('t');
    const summary = credentialsSummaryFrom(merged);
    expect(summary).toEqual({ appId: 'a' });
  });
});

describe('credential summary exposure', () => {
  it('exposes only appId/pageName/pageId and ignores blanks', () => {
    const summary = credentialsSummaryFrom({ appId: 'a', appSecret: 's', pageName: '', pageId: 'p', pageAccessToken: 't' });
    expect(summary).toEqual({ appId: 'a', pageId: 'p' });
  });

  it('returns null for empty input objects', () => {
    expect(credentialsSummaryFrom(undefined)).toBeNull();
    expect(credentialsSummaryFrom({})).toBeNull();
    expect(credentialsSummaryFrom({ pageAccessToken: 't' })).toBeNull();
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

describe('manual publish — duplicate protection', () => {
  it('allows publishing when the channel has no prior job for the video', () => {
    expect(publishingConflictFor([])).toBeNull();
  });

  it('blocks a new job while a queued/uploading/processing job exists', () => {
    for (const status of ['PENDING', 'UPLOADING', 'PROCESSING']) {
      expect(publishingConflictFor([{ status }])).toBe('ACTIVE');
    }
  });

  it('reports PUBLISHED so a re-publish requires explicit confirmation', () => {
    expect(publishingConflictFor([{ status: 'PUBLISHED' }])).toBe('PUBLISHED');
  });

  it('allows a new job after a FAILED or CANCELLED attempt', () => {
    expect(publishingConflictFor([{ status: 'FAILED' }])).toBeNull();
    expect(publishingConflictFor([{ status: 'CANCELLED' }])).toBeNull();
  });

  it('treats an ACTIVE job as the harder conflict even when a PUBLISHED exists', () => {
    expect(publishingConflictFor([{ status: 'PUBLISHED' }, { status: 'PENDING' }])).toBe('ACTIVE');
  });
});

describe('manual publish — video eligibility', () => {
  it('only READY / NEEDS_REVIEW videos are publishable', () => {
    for (const status of ['READY', 'NEEDS_REVIEW']) {
      expect(isVideoPublishable(status)).toBe(true);
    }
    for (const status of ['DRAFT', 'GENERATING', 'RENDERING', 'FAILED', undefined, null]) {
      expect(isVideoPublishable(status)).toBe(false);
    }
  });
});

describe('manual publish — channel publish schema', () => {
  it('accepts a publish payload with optional schedule, description and confirm', () => {
    const result = PublishToChannelSchema.safeParse({
      videoId: '00000000-0000-4000-8000-000000000001',
      scheduledAt: '2026-01-01T12:00:00.000Z',
      description: 'manual publish',
      confirm: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.confirm).toBe(true);
    expect(result.data.scheduledAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('accepts a minimal videoId-only payload', () => {
    const result = PublishToChannelSchema.safeParse({ videoId: '00000000-0000-4000-8000-000000000002' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.scheduledAt).toBeUndefined();
    expect(result.data.description).toBeUndefined();
  });

  it('rejects a missing or invalid videoId', () => {
    expect(PublishToChannelSchema.safeParse({}).success).toBe(false);
    expect(PublishToChannelSchema.safeParse({ videoId: 'nope' }).success).toBe(false);
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

describe('credential save/persist regression', () => {
  it('A: save all new credentials from scratch', () => {
    const merged = mergeCredentials(undefined, {
      appId: 'app123',
      appSecret: 'secret456',
      pageName: 'My Page',
      pageId: 'page789',
      pageAccessToken: 'tok_abc',
    });
    expect(merged).toEqual({
      appId: 'app123',
      appSecret: 'secret456',
      pageName: 'My Page',
      pageId: 'page789',
      pageAccessToken: 'tok_abc',
    });
    const summary = credentialsSummaryFrom(merged);
    expect(summary).toEqual({ appId: 'app123', pageName: 'My Page', pageId: 'page789' });
  });

  it('B: save pageId/pageName but keep token + appSecret', () => {
    const existing = {
      appId: 'app123',
      appSecret: 'old_secret',
      pageName: 'Old Name',
      pageId: 'old_page',
      pageAccessToken: 'old_token',
    };
    const merged = mergeCredentials(existing, { pageId: 'new_page', pageName: 'New Name' });
    expect(merged.appSecret).toBe('old_secret');
    expect(merged.pageAccessToken).toBe('old_token');
    expect(merged.pageId).toBe('new_page');
    expect(merged.pageName).toBe('New Name');
    expect(merged.appId).toBe('app123');
    const summary = credentialsSummaryFrom(merged);
    expect(summary).toEqual({ appId: 'app123', pageName: 'New Name', pageId: 'new_page' });
  });

  it('C: empty secret inputs do not wipe existing secrets', () => {
    const existing = {
      appId: 'app123',
      appSecret: 'real_secret',
      pageName: 'My Page',
      pageId: 'page789',
      pageAccessToken: 'real_token',
    };
    const merged = mergeCredentials(existing, {
      appId: 'app123',
      pageName: 'My Page',
      pageId: 'page789',
      pageAccessToken: '',
      appSecret: '',
    });
    expect(merged.pageAccessToken).toBe('real_token');
    expect(merged.appSecret).toBe('real_secret');
  });

  it('D: credentialsSummary returns exactly appId/pageName/pageId', () => {
    const merged = {
      appId: 'app123',
      appSecret: 'secret',
      pageName: 'My Page',
      pageId: 'page789',
      pageAccessToken: 'tok',
    };
    const summary = credentialsSummaryFrom(merged);
    expect(summary).toEqual({ appId: 'app123', pageName: 'My Page', pageId: 'page789' });
    expect(summary).not.toHaveProperty('appSecret');
    expect(summary).not.toHaveProperty('pageAccessToken');
  });

  it('E: summary preserves pageId/pageName after token-only update', () => {
    const existing = {
      appId: 'app123',
      appSecret: 'secret',
      pageName: 'My Page',
      pageId: 'page789',
      pageAccessToken: 'old_token',
    };
    const merged = mergeCredentials(existing, { pageAccessToken: 'new_token' });
    const summary = credentialsSummaryFrom(merged);
    expect(summary).toEqual({ appId: 'app123', pageName: 'My Page', pageId: 'page789' });
  });
});
