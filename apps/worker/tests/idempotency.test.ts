import { describe, expect, it } from 'vitest';
import { isPublishingFinished } from '../src/jobs/publish-video.js';

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
