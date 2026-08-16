export const SCHEDULE_DAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export const SCHEDULE_DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

function atTime(date: Date, hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(':').map((n) => parseInt(n, 10));
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}

function timezoneOffsetMs(tz: string, at: Date): number {
  return wallTimeAsUtc(tz, at) - at.getTime();
}

/** Wall-clock fields of `at` in `tz`, re-encoded as a naive UTC-ms value. */
function wallTimeAsUtc(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (k: string) => parseInt(parts.find((p) => p.type === k)?.value ?? '0', 10);
  const h = get('hour') === 24 ? 0 : get('hour');
  return Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
}

function wallDate(tz: string, at: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const num = (k: string) => parseInt(parts.find((p) => p.type === k)?.value ?? '0', 10);
  return { y: num('year'), m: num('month'), d: num('day') };
}

function addWallDays(base: { y: number; m: number; d: number }, days: number): { y: number; m: number; d: number } {
  const date = new Date(Date.UTC(base.y, base.m - 1, base.d, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function wallDow(wall: { y: number; m: number; d: number }): number {
  return new Date(Date.UTC(wall.y, wall.m - 1, wall.d, 12)).getUTCDay();
}

/** UTC instant whose wall-clock in `tz` is `wall@hh:mm` (DST-safe fixed point). */
function zonedInstant(tz: string, wall: { y: number; m: number; d: number }, hh: number, mm: number): Date {
  const target = Date.UTC(wall.y, wall.m - 1, wall.d, hh, mm, 0, 0);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    instant = target - (timezoneOffsetMs(tz, new Date(instant)));
  }
  return new Date(instant);
}

/**
 * Computes the next scheduled datetime after `from` that matches the given
 * "HH:mm" times and allowed weekdays (empty days = every day).
 *
 * Without a timezone the schedule is interpreted in server-local time. With an
 * IANA timezone (e.g. "Asia/Tokyo") the wall-clock times are interpreted in
 * that zone and converted to absolute UTC instants.
 */
export function nextRunTime(
  times: string[],
  days: string[],
  from: Date = new Date(),
  timezone?: string,
): Date | null {
  const valid = times.map(toMinutes).filter((m) => !Number.isNaN(m)).sort((a, b) => a - b);
  if (valid.length === 0) return null;

  const allowed =
    days.length === 0
      ? new Set([0, 1, 2, 3, 4, 5, 6])
      : new Set(days.map((d) => SCHEDULE_DAY_INDEX[d]).filter((d) => d !== undefined));

  if (!timezone) {
    const nowMin = from.getHours() * 60 + from.getMinutes();
    for (const m of valid) {
      if (allowed.has(from.getDay()) && m > nowMin) {
        return atTime(from, String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
      }
    }
    for (let offset = 1; offset <= 8; offset++) {
      const next = new Date(from);
      next.setDate(from.getDate() + offset);
      if (allowed.has(next.getDay())) {
        return atTime(next, String(Math.floor(valid[0]! / 60)).padStart(2, '0') + ':' + String(valid[0]! % 60).padStart(2, '0'));
      }
    }
    return null;
  }

  const today = wallDate(timezone, from);
  const fromMs = from.getTime();
  for (let offset = 0; offset <= 8; offset++) {
    const wall = addWallDays(today, offset);
    if (!allowed.has(wallDow(wall))) continue;
    for (const m of valid) {
      const instant = zonedInstant(timezone, wall, Math.floor(m / 60), m % 60);
      if (instant.getTime() > fromMs) return instant;
    }
  }

  return null;
}

export function formatRunDelayMs(next: Date, from: Date = new Date()): number {
  return Math.max(0, next.getTime() - from.getTime());
}

/**
 * Absolute UTC instant of the start of the current day for a given IANA
 * timezone (server-local day when no timezone is provided).
 */
export function startOfDayInZone(timezone?: string, from: Date = new Date()): Date {
  if (!timezone) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const wall = wallDate(timezone, from);
  return zonedInstant(timezone, wall, 0, 0);
}
