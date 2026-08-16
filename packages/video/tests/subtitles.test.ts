import { describe, expect, it } from 'vitest';
import { buildCues, buildSrt } from '../src/subtitles.js';
import type { SubtitleCue } from '../src/types.js';

describe('buildCues', () => {
  it('builds one cue per scene with cumulative start times', () => {
    const cues = buildCues(
      [
        { durationSeconds: 5, subtitleText: 'Hello' },
        { durationSeconds: 6, subtitleText: 'World' },
        { durationSeconds: 4, subtitleText: '' },
      ],
      [0, 5000, 11000],
    );
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ index: 1, startMs: 0, endMs: 5000, text: 'Hello' });
    expect(cues[1]).toMatchObject({ index: 2, startMs: 5000, endMs: 11000, text: 'World' });
  });
});

describe('buildSrt', () => {
  it('renders SRT with ordered cues', () => {
    const cues: SubtitleCue[] = [
      { index: 1, startMs: 0, endMs: 2000, text: 'Hello' },
      { index: 2, startMs: 2000, endMs: 4000, text: 'World' },
    ];
    const srt = buildSrt(cues);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,000\nHello');
    expect(srt).toContain('2\n00:00:02,000 --> 00:00:04,000\nWorld');
  });
});
