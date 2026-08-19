import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@avf/database';
import { FacebookProvider, createPlatformProvider, type SocialProvider } from '@avf/social';
import { SecretCipher } from '@avf/config';
import type { WorkerContext } from '../context.js';
import { recordLog, failPublishingJob, shortMessage } from '../lib/status.js';
import { ensureTempRoot } from '../lib/temp.js';

interface PublishVideoPayload {
  publishingJobId: string;
  videoId: string;
  projectId: string;
}

/**
 * Idempotency guard for publish jobs. A publishing job is considered finished
 * once it is PUBLISHED or CANCELLED — re-delivery (retry after a network blip,
 * or a duplicate BullMQ delivery) must not publish twice. Shared by the worker
 * handler and unit tests.
 */
export function isPublishingFinished(status: string | null | undefined): boolean {
  return status === 'PUBLISHED' || status === 'CANCELLED';
}

/**
 * Publishes a finished video to a destination. Legacy Facebook pages use the
 * official Graph API (page-scoped token, AES-decrypted at publish time).
 * Campaign flow destinations resolve through the linked publishing channel:
 *   - Facebook page linked to the channel -> Graph API flow above;
 *   - PublishingAccount linked to the channel -> platform provider
 *     (GenericPlatformProvider mock or HTTP endpoint; TikTok/YouTube/IG).
 */
export async function handlePublishVideo(
  ctx: WorkerContext,
  payload: PublishVideoPayload,
): Promise<void> {
  const { publishingJobId, videoId, projectId } = payload;
  const started = Date.now();

  const publishingJob = await prisma.publishingJob.findFirst({
    where: { id: publishingJobId, videoId },
    include: {
      facebookPage: true,
      campaign: true,
      channel: { include: { publishingAccount: true } },
      video: { include: { project: true } },
    },
  });
  if (!publishingJob) throw new Error('Publishing job not found');

  // Duplicate execution safety: a finished job is never published again.
  if (isPublishingFinished(publishingJob.status)) {
    console.log(`[publish-video] ${publishingJobId} already ${publishingJob.status}, skipping`);
    return;
  }

  await prisma.publishingJob.update({
    where: { id: publishingJobId },
    data: { status: 'UPLOADING', errorMessage: null },
  });

  const workDir = join(await ensureTempRoot(), 'publish');
  await mkdir(workDir, { recursive: true });
  const localPath = join(workDir, `${videoId}.mp4`);

  try {
    const { video, facebookPage, channel } = publishingJob;
    if (!video.fileKey) throw new Error('Video has no rendered file');

    // Resolve destination: legacy Facebook page first, then the channel's
    // linked publishing account.
    let provider: SocialProvider;
    let pageId: string;
    let token: string;
    let destinationName = 'publishing-destination';
    let platformName = 'FACEBOOK';

    if (facebookPage?.accessTokenEnc) {
      provider = new FacebookProvider();
      pageId = facebookPage.pageId;
      token = ctx.cipher.decrypt(facebookPage.accessTokenEnc);
      destinationName = facebookPage.pageName;
      platformName = 'FACEBOOK';
    } else if (channel?.publishingAccount?.credentials) {
      const account = channel.publishingAccount;
      provider = createPlatformProvider(
        account.platform,
        (account.metadata ?? null) as Record<string, unknown> | null,
      );
      pageId = account.externalAccountId ?? account.id;
      token = ctx.cipher.decrypt(account.credentials);
      destinationName = account.accountName;
      platformName = account.platform;
    } else if (channel?.credentials) {
      const secretCipher = new SecretCipher();
      const creds = JSON.parse(secretCipher.decrypt(channel.credentials)) as Record<string, string>;
      provider = new FacebookProvider();
      if (channel.platform === 'FACEBOOK') {
        pageId = creds.pageId ?? '';
        token = creds.pageAccessToken ?? '';
        destinationName = creds.pageName ?? channel.name;
        platformName = 'FACEBOOK';
      } else {
        token = creds.accessToken ?? Object.values(creds).find((v) => typeof v === 'string' && v.length > 50) ?? '';
        pageId = creds.channelId ?? creds.externalAccountId ?? channel.id;
        destinationName = creds.channelName ?? creds.pageName ?? channel.name;
        platformName = channel.platform;
        provider = createPlatformProvider(channel.platform);
      }
      if (!token) throw new Error('Channel credentials are missing a valid access token');
    } else {
      throw new Error(
        'Publishing destination is not configured (no Facebook page token and no publishing account)',
      );
    }

    const buf = await ctx.storage.get(video.fileKey);
    await writeFile(localPath, buf);

    const description = [
      video.caption,
      (video.hashtags ?? []).join(' '),
      publishingJob.descriptionOverride,
    ]
      .filter(Boolean)
      .join('\n\n');

    const scheduled = publishingJob.scheduledAt
      ? Math.floor(publishingJob.scheduledAt.getTime() / 1000)
      : undefined;

    const result = await provider.publishVideo({
      pageId,
      accessToken: token,
      videoPath: localPath,
      description: description || video.title,
      scheduledPublishTime: scheduled,
    });

    const publishedAt = new Date();
    await prisma.publishingJob.update({
      where: { id: publishingJobId },
      data: {
        status: result.scheduled ? 'PROCESSING' : 'PUBLISHED',
        facebookPostId: result.postId,
        publishedAt: result.scheduled ? null : publishedAt,
        errorMessage: null,
      },
    });
    if (!result.scheduled) {
      await prisma.video.update({
        where: { id: videoId },
        data: { publishedAt },
      });
    }

    // Seed zeroed analytics rows so the dashboard can aggregate them.
    await prisma.analytics.createMany({
      data: ['VIEWS', 'LIKES', 'COMMENTS', 'SHARES', 'REACH'].map((metric) => ({
        videoId,
        projectId,
        publishingJobId,
        campaignId: publishingJob.campaignId,
        facebookPostId: result.postId,
        metric: metric as never,
        value: 0,
      })),
      skipDuplicates: false,
    });

    await recordLog({
      projectId,
      contentId: video.contentId,
      videoId,
      jobType: 'FACEBOOK_PUBLISH',
      provider: platformName,
      model: destinationName,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = shortMessage(err);
    await failPublishingJob(publishingJobId, message);
    throw err;
  } finally {
    let cleanup: { removed: boolean; reason?: string };
    try {
      await rm(localPath, { force: true });
      cleanup = { removed: true };
    } catch (e) {
      cleanup = { removed: false, reason: e instanceof Error ? e.message : String(e) };
    }
    console.log(
      `[publish-video] temp cleanup ${localPath}: ${cleanup.removed ? 'ok' : cleanup.reason ?? 'skipped'}`,
    );
  }
}
