import { randomUUID } from 'node:crypto';
import type {
  FacebookPageInfo,
  FacebookUser,
  PublishVideoInput,
  PublishVideoResult,
  SocialProvider,
} from './types.js';
import { SocialProviderError } from './types.js';
import { FacebookProvider } from './facebook.js';

/**
 * Generic publishing provider for platforms without a dedicated SDK client
 * (TikTok, YouTube, Instagram, ...). Destination behaviour is driven by the
 * linked PublishingAccount:
 *   - `metadata.endpoint` + `metadata.apiKey`: posts the video descriptor to a
 *     configured webhook/HTTP endpoint (integration point for real APIs).
 *   - otherwise: mock mode — records a successful publish without a network
 *     call so the full multi-channel pipeline is testable end-to-end.
 */
export class GenericPlatformProvider implements SocialProvider {
  readonly name: string;
  private readonly metadata: Record<string, unknown> | null;

  constructor(platform: string, metadata?: Record<string, unknown> | null) {
    this.name = platform.toUpperCase();
    this.metadata = metadata ?? null;
  }

  getLoginUrl(): string {
    throw new SocialProviderError(
      'AUTH_ERROR',
      `${this.name} OAuth must be configured through a publishing account`,
    );
  }

  exchangeCodeForToken(): Promise<{ accessToken: string; expiresAt: Date | null; user: FacebookUser }> {
    throw new SocialProviderError(
      'AUTH_ERROR',
      `${this.name} OAuth is not available for generic publishing accounts`,
    );
  }

  listPages(): Promise<FacebookPageInfo[]> {
    throw new SocialProviderError(
      'AUTH_ERROR',
      `${this.name} page listing is not supported for generic publishing accounts`,
    );
  }

  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    const endpoint = this.metadata?.endpoint;
    if (typeof endpoint === 'string' && /^https?:\/\//.test(endpoint)) {
      const apiKey = typeof this.metadata?.apiKey === 'string' ? this.metadata.apiKey : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          platform: this.name,
          destinationId: input.pageId,
          description: input.description,
          videoPath: input.videoPath,
          fileUrl: input.fileUrl,
          scheduledPublishTime: input.scheduledPublishTime,
        }),
      });
      if (!response.ok) {
        throw new SocialProviderError(
          'PROVIDER_ERROR',
          `${this.name}: publish endpoint responded ${response.status}`,
        );
      }
      const json = (await response.json().catch(() => ({}))) as { id?: string };
      return {
        postId: json.id ?? `remote:${this.name}:${randomUUID()}`,
        permalinkUrl: null,
        scheduled: false,
      };
    }

    // Mock mode — no network, deterministic success for local/CI pipelines.
    return {
      postId: `mock:${this.name.toLowerCase()}:${randomUUID()}`,
      permalinkUrl: null,
      scheduled: Boolean(input.scheduledPublishTime),
    };
  }
}

/** Platform -> provider factory. Facebook uses the Graph API client. */
export function createPlatformProvider(
  platform: string,
  metadata?: Record<string, unknown> | null,
): SocialProvider {
  if (platform.toUpperCase() === 'FACEBOOK') return new FacebookProvider();
  return new GenericPlatformProvider(platform, metadata);
}
