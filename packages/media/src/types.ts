// ---------------------------------------------------------------------------
// Image / Video / Voice provider contracts
// ---------------------------------------------------------------------------

export interface GeneratedAsset {
  /** Bytes of the generated media. */
  data: Buffer;
  mimeType: string;
  provider: string;
  model: string;
  /** Optional extra metadata (e.g. dimensions, duration). */
  metadata?: Record<string, unknown>;
}

export interface MediaErrorDetails {
  code: 'RATE_LIMIT' | 'AUTH_ERROR' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
  provider: string;
  message: string;
  retryable: boolean;
}

export class MediaProviderError extends Error {
  readonly code: MediaErrorDetails['code'];
  readonly provider: string;
  readonly retryable: boolean;

  constructor(details: MediaErrorDetails) {
    super(details.message);
    this.name = 'MediaProviderError';
    this.code = details.code;
    this.provider = details.provider;
    this.retryable = details.retryable;
  }
}

export function mediaError(
  code: MediaErrorDetails['code'],
  provider: string,
  message: string,
  retryable = false,
): MediaProviderError {
  return new MediaProviderError({ code, provider, message, retryable });
}

export async function fetchBinary(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      throw mediaError('PROVIDER_ERROR', url, `HTTP ${response.status}: ${text.slice(0, 200)}`, true);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type'),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw mediaError('TIMEOUT', url, `Timed out after ${timeoutMs}ms`, true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

export interface ImageGenerationInput {
  prompt: string;
  /** "1024x1024", "1080x1920", ... */
  size?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  requestId?: string;
}

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generateImage(input: ImageGenerationInput): Promise<GeneratedAsset>;
}

// ---------------------------------------------------------------------------
// Video (motion)
// ---------------------------------------------------------------------------

export interface VideoGenerationInput {
  prompt: string;
  imageUrl?: string;
  durationSeconds?: number;
  resolution?: string;
  requestId?: string;
}

export interface VideoProvider {
  readonly name: string;
  readonly model: string;
  generateVideo(input: VideoGenerationInput): Promise<GeneratedAsset>;
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export type TTSLanguage = 'vi-VN' | 'en-US' | 'ja-JP';

export interface VoiceGenerationInput {
  text: string;
  language?: TTSLanguage;
  voice?: string;
  speed?: number;
  pitch?: number;
  requestId?: string;
}

export interface VoiceGenerationResult extends GeneratedAsset {
  /** Approximate audio duration in seconds, when the provider can compute it. */
  durationSeconds?: number;
}

export interface VoiceProvider {
  readonly name: string;
  readonly model: string;
  generateVoice(input: VoiceGenerationInput): Promise<VoiceGenerationResult>;
}
