import { describe, expect, it } from 'vitest';
import { queueForJob, validateJobPayload, JOB_QUEUE_MAP } from '../src/types.js';

describe('queue job mapping', () => {
  it('routes every job to the expected queue', () => {
    expect(queueForJob('generate-content')).toBe('content');
    expect(queueForJob('generate-scenes')).toBe('scene');
    expect(queueForJob('generate-image')).toBe('media');
    expect(queueForJob('render-video')).toBe('render');
    expect(queueForJob('publish-video')).toBe('publish');
    expect(queueForJob('scheduled-run')).toBe('schedule');
    expect(queueForJob('quality-check')).toBe('qa');
  });

  it('falls back to default queue for unknown jobs', () => {
    expect(queueForJob('nope')).toBe('default');
  });
});

describe('validateJobPayload', () => {
  it('accepts valid render payloads', () => {
    expect(() =>
      validateJobPayload('render-video', { videoId: 'v', renderJobId: 'r', projectId: 'p' }),
    ).not.toThrow();
  });

  it('throws on missing fields', () => {
    expect(() => validateJobPayload('render-video', { videoId: 'v' })).toThrow();
  });

  it('passes through jobs without a schema', () => {
    expect(() => validateJobPayload('custom-job', { anything: 1 })).not.toThrow();
  });
});

describe('JOB_QUEUE_MAP', () => {
  it('has an entry for every registered job', () => {
    const jobs = [
      'generate-content',
      'generate-scenes',
      'generate-image',
      'generate-video',
      'generate-voice',
      'generate-subtitle',
      'render-video',
      'quality-check',
      'publish-video',
      'scheduled-run',
    ];
    for (const job of jobs) {
      expect(JOB_QUEUE_MAP[job]).toBeDefined();
    }
  });
});
