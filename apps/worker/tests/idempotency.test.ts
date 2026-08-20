import { describe, expect, it } from 'vitest';
import { SocialProviderError } from '@avf/social';
import { isPublishingFinished, shouldRetryPublishError } from '../src/jobs/publish-video.js';

describe('isPublishingFinished (idempotency guard)', () => {
  it('treats PUBLISHED as finished', () => {
    expect(isPublishingFinished('PUBLISHED')).toBe(true);
  });

  it('treats CANCELLED as finished', () => {
    expect(isPublishingFinished('CANCELLED')).toBe(true);
  });

  it('treats in-flight states as not finished', () => {
    for (const status of ['PENDING', 'UPLOADING', 'PROCESSING', 'FAILED', null, undefined]) {
      expect(isPublishingFinished(status)).toBe(false);
    }
  });
});

describe('shouldRetryPublishError', () => {
  it('never retries auth errors (expired/invalid token)', () => {
    const authError = new SocialProviderError('AUTH_ERROR', 'Session has expired');
    expect(shouldRetryPublishError(authError)).toBe(false);
  });

  it('retries transient provider errors', () => {
    const rateLimit = new SocialProviderError('RATE_LIMIT', 'Too many requests');
    const timeout = new SocialProviderError('TIMEOUT', 'Request timed out');
    expect(shouldRetryPublishError(rateLimit)).toBe(true);
    expect(shouldRetryPublishError(timeout)).toBe(true);
  });

  it('retries unrelated/unknown errors', () => {
    expect(shouldRetryPublishError(new Error('database went away'))).toBe(true);
    expect(shouldRetryPublishError('string error')).toBe(true);
  });
});
