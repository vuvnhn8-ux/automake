export interface FacebookPageInfo {
  /** Facebook page id (string, not numeric in Graph API). */
  pageId: string;
  pageName: string;
  /** Page-scoped access token. */
  accessToken: string;
  tokenExpiresAt: Date | null;
  scopes: string[];
}

export interface PublishVideoInput {
  pageId: string;
  accessToken: string;
  /** Description / caption text. */
  description: string;
  /** Local path to the video file, or a public file_url. */
  videoPath?: string;
  fileUrl?: string;
  thumbnailPath?: string;
  /** Unix timestamp in seconds; scheduling requires published=false. */
  scheduledPublishTime?: number;
}

export interface PublishVideoResult {
  postId: string;
  permalinkUrl: string | null;
  scheduled: boolean;
}

export interface FacebookUser {
  id: string;
  name: string;
}

export class SocialProviderError extends Error {
  readonly code:
    | 'AUTH_ERROR'
    | 'RATE_LIMIT'
    | 'TIMEOUT'
    | 'PROVIDER_ERROR'
    | 'INVALID_REQUEST'
    | 'UNKNOWN_ERROR';
  readonly retryable: boolean;
  readonly fbErrorCode?: number;

  constructor(
    code: SocialProviderError['code'],
    message: string,
    opts?: { fbErrorCode?: number },
  ) {
    super(message);
    this.name = 'SocialProviderError';
    this.code = code;
    this.retryable =
      code === 'RATE_LIMIT' || code === 'TIMEOUT' || code === 'PROVIDER_ERROR';
    this.fbErrorCode = opts?.fbErrorCode;
  }
}

export interface SocialProvider {
  readonly name: string;
  getLoginUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<{ accessToken: string; expiresAt: Date | null; user: FacebookUser }>;
  listPages(accessToken: string): Promise<FacebookPageInfo[]>;
  publishVideo(input: PublishVideoInput): Promise<PublishVideoResult>;
}
