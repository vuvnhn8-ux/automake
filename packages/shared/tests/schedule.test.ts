import { describe, expect, it } from 'vitest';
import { nextRunTime, formatRunDelayMs, startOfDayInZone, toMinutes } from '../src/schedule.js';

describe('toMinutes', () => {
  it('parses HH:mm into minutes', () => {
    expect(toMinutes('08:00')).toBe(480);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('00:30')).toBe(30);
  });

  it('returns NaN for garbage', () => {
    expect(Number.isNaN(toMinutes('abc'))).toBe(true);
  });
});

describe('nextRunTime', () => {
  it('returns the same-day later slot', () => {
    const from = new Date('2026-08-15T10:00:00');
    const next = nextRunTime(['08:00', '14:30'], [], from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(new Date('2026-08-15T14:30:00').getTime());
  });

  it('rolls to the next day when all times passed', () => {
    const from = new Date('2026-08-15T20:00:00');
    const next = nextRunTime(['08:00'], [], from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(new Date('2026-08-16T08:00:00').getTime());
  });

  it('respects weekdays', () => {
    // 2026-08-15 is a Saturday. Sunday 08:00 is the next allowed slot.
    const from = new Date('2026-08-15T10:00:00');
    const next = nextRunTime(['08:00'], ['SUNDAY'], from);
    expect(next!.getDay()).toBe(0);
  });

  it('returns null when no times', () => {
    expect(nextRunTime([], [], new Date())).toBeNull();
  });
});

describe('nextRunTime (timezone aware)', () => {
  // Asia/Tokyo is UTC+9 year-round (no DST), so results are deterministic.
  it('interprets wall-clock times in the target timezone', () => {
    const from = new Date('2026-08-15T00:00:00Z'); // 09:00 JST
    const next = nextRunTime(['10:00'], [], from, 'Asia/Tokyo');
    // 10:00 JST on Aug 15 = 01:00Z on Aug 15
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-08-15T01:00:00.000Z');
  });

  it('skips slots already passed in the target timezone and rolls to the next day', () => {
    const from = new Date('2026-08-15T00:00:00Z'); // 09:00 JST on Saturday
    const next = nextRunTime(['08:00'], [], from, 'Asia/Tokyo');
    // 08:00 JST on Aug 15 already passed (it is 09:00 JST now) -> Aug 16 08:00 JST = Aug 15 23:00Z
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-08-15T23:00:00.000Z');
  });

  it('respects weekdays in the target timezone', () => {
    const from = new Date('2026-08-15T00:00:00Z'); // Saturday JST
    const next = nextRunTime(['12:00'], ['MONDAY'], from, 'Asia/Tokyo');
    // Monday Aug 17 12:00 JST = Aug 17 03:00Z
    expect(next!.toISOString()).toBe('2026-08-17T03:00:00.000Z');
  });
});

describe('startOfDayInZone', () => {
  it('returns midnight of the local day in the given zone', () => {
    // 15:00Z on Aug 15 == 00:00 JST on Aug 16
    const from = new Date('2026-08-15T15:00:00Z');
    const day = startOfDayInZone('Asia/Tokyo', from);
    expect(day.toISOString()).toBe('2026-08-15T15:00:00.000Z');
  });

  it('falls back to server-local midnight without a timezone', () => {
    const from = new Date('2026-08-15T15:00:00Z');
    const day = startOfDayInZone(undefined, from);
    expect(day.getTime()).toBeLessThanOrEqual(from.getTime());
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
  });
});

describe('formatRunDelayMs', () => {
  it('computes a non-negative delay', () => {
    const from = new Date('2026-08-15T10:00:00');
    const target = new Date('2026-08-15T10:30:00');
    expect(formatRunDelayMs(target, from)).toBe(30 * 60 * 1000);
    expect(formatRunDelayMs(new Date(from.getTime() - 1000), from)).toBe(0);
  });
});
