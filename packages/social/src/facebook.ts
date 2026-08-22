import { readFile } from 'node:fs/promises';
import { env } from '@avf/config';
import type {
  FacebookPageInfo,
  FacebookUser,
  PublishVideoInput,
  PublishVideoResult,
  SocialProvider,
} from './types.js';
import { SocialProviderError } from './types.js';

const GRAPH = 'https://graph.facebook.com';
const SCOPES =
  'pages_show_list,pages_manage_posts,pages_read_engagement,pages_read_user_content';

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

function throwGraphError(resource: string, status: number, body: string): never {
  let parsed: GraphErrorBody = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* keep empty */
  }
  const fbCode = parsed.error?.code;
  const fbSubcode = parsed.error?.error_subcode;
  const message = parsed.error?.message ?? body.slice(0, 300);
  let code: SocialProviderError['code'] = 'PROVIDER_ERROR';
  if (status === 401 || status === 403) code = 'AUTH_ERROR';
  if (status === 429) code = 'RATE_LIMIT';
  if (fbCode === 190) code = 'AUTH_ERROR'; // token expired/invalid
  if (fbCode === 100 || fbCode === 200) code = 'AUTH_ERROR'; // permission denied / missing permission
  if (fbCode === 4 || fbCode === 17) code = 'RATE_LIMIT'; // rate limits
  if (fbCode === 613) code = 'TIMEOUT';
  throw new SocialProviderError(code, `${resource}: ${message}`, { fbErrorCode: fbCode });
}

/**
 * Official Meta Graph API client. No browser automation — everything goes
 * through the documented OAuth + Graph endpoints.
 */
export class FacebookProvider implements SocialProvider {
  readonly name = 'FACEBOOK';

  getLoginUrl(state: string): string {
    if (!env.FACEBOOK_APP_ID) {
      throw new SocialProviderError('AUTH_ERROR', 'FACEBOOK_APP_ID is not configured');
    }
    const params = new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID,
      redirect_uri: env.FACEBOOK_REDIRECT_URI,
      scope: SCOPES,
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    expiresAt: Date | null;
    user: FacebookUser;
  }> {
    if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
      throw new SocialProviderError('AUTH_ERROR', 'Facebook app credentials are not configured');
    }
    const params = new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      redirect_uri: env.FACEBOOK_REDIRECT_URI,
      code,
    });
    const response = await fetch(`${GRAPH}/${env.FACEBOOK_GRAPH_VERSION}/oauth/access_token?${params}`);
    const body = await response.text();
    if (!response.ok) throwGraphError('oauth/access_token', response.status, body);

    const token = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (!token.access_token) {
      throwGraphError('oauth/access_token', 400, 'missing access_token');
    }

    // Exchange for a long-lived token.
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      fb_exchange_token: token.access_token,
    });
    const longResponse = await fetch(
      `${GRAPH}/${env.FACEBOOK_GRAPH_VERSION}/oauth/access_token?${longParams}`,
    );
    const longBody = await longResponse.text();
    if (!longResponse.ok) throwGraphError('oauth/access_token(long)', longResponse.status, longBody);

    const longToken = JSON.parse(longBody) as {
      access_token?: string;
      expires_in?: number;
    };
    const accessToken = longToken.access_token ?? token.access_token;
    const expiresIn = longToken.expires_in ?? token.expires_in;

    const user = await this.me(accessToken);
    return {
      accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      user,
    };
  }

  async me(accessToken: string): Promise<FacebookUser> {
    const params = new URLSearchParams({ fields: 'id,name', access_token: accessToken });
    const response = await fetch(`${GRAPH}/${env.FACEBOOK_GRAPH_VERSION}/me?${params}`);
    const body = await response.text();
    if (!response.ok) throwGraphError('me', response.status, body);
    const json = JSON.parse(body) as { id?: string; name?: string };
    if (!json.id) throwGraphError('me', 400, 'missing id');
    return { id: json.id, name: json.name ?? 'Facebook user' };
  }

  async listPages(accessToken: string): Promise<FacebookPageInfo[]> {
    const params = new URLSearchParams({
      fields: 'id,name,access_token,expires_at',
      access_token: accessToken,
    });
    const response = await fetch(`${GRAPH}/${env.FACEBOOK_GRAPH_VERSION}/me/accounts?${params}`);
    const body = await response.text();
    if (!response.ok) throwGraphError('me/accounts', response.status, body);

    const json = JSON.parse(body) as {
      data?: { id: string; name: string; access_token?: string; expires_at?: number }[];
    };
    return (json.data ?? [])
      .filter((p) => p.access_token)
      .map((p) => ({
        pageId: p.id,
        pageName: p.name,
        accessToken: p.access_token!,
        tokenExpiresAt: p.expires_at ? new Date(p.expires_at * 1000) : null,
        scopes: SCOPES.split(','),
      }));
  }

  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    const endpoint = input.scheduledPublishTime
      ? `${GRAPH}/${env.FACEBOOK_GRAPH_VERSION}/${input.pageId}/videos`
      : `${GRAPH}/${env.FACEBOOK_GRAPH_VERSION}/${input.pageId}/videos`;

    const form = new FormData();
    if (input.videoPath) {
      const bytes = await readFile(input.videoPath);
      form.append(
        'source',
        new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }) as unknown as Blob,
        'video.mp4',
      );
    } else if (input.fileUrl) {
      form.append('file_url', input.fileUrl);
    } else {
      throw new SocialProviderError('INVALID_REQUEST', 'publishVideo requires videoPath or fileUrl');
    }
    form.append('description', input.description);
    form.append('access_token', input.accessToken);

    if (input.scheduledPublishTime) {
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(input.scheduledPublishTime));
    }
    if (input.thumbnailPath) {
      const thumb = await readFile(input.thumbnailPath);
      form.append(
        'thumb',
        new Blob([new Uint8Array(thumb)], { type: 'image/jpeg' }) as unknown as Blob,
        'thumb.jpg',
      );
    }

    const response = await fetch(endpoint, { method: 'POST', body: form });
    const body = await response.text();
    if (!response.ok) throwGraphError('page/videos', response.status, body);

    const json = JSON.parse(body) as { id?: string };
    if (!json.id) throwGraphError('page/videos', 400, 'missing id');

    return {
      postId: json.id,
      permalinkUrl: null,
      scheduled: Boolean(input.scheduledPublishTime),
    };
  }
}
