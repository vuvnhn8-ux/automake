import { describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage } from '@avf/config';
import { nextReportTime, startOfDayInZone } from '../src/jobs/telegram-daily-report.js';

describe('telegram daily report scheduling', () => {
  it('computes start of day in a non-UTC timezone', () => {
    const now = new Date('2026-08-16T23:30:00.000Z');
    const start = startOfDayInZone('Asia/Tokyo', now);
    expect(start.toISOString()).toBe('2026-08-16T15:00:00.000Z');
  });

  it('returns today when the report time is still ahead', () => {
    const now = new Date('2026-08-15T20:00:00.000Z');
    const target = nextReportTime('07:00', 'Asia/Tokyo', now);
    expect(target.toISOString()).toBe('2026-08-15T22:00:00.000Z');
  });

  it('rolls to tomorrow when the report time already passed', () => {
    const now = new Date('2026-08-16T01:00:00.000Z');
    const target = nextReportTime('07:00', 'Asia/Tokyo', now);
    expect(target.toISOString()).toBe('2026-08-16T22:00:00.000Z');
  });

  it('falls back to 07:00 when the time is unparsable', () => {
    const now = new Date('2026-08-15T20:00:00.000Z');
    const target = nextReportTime('not-a-time', 'Asia/Tokyo', now);
    expect(target.toISOString()).toBe('2026-08-15T22:00:00.000Z');
  });
});

describe('sendTelegramMessage', () => {
  it('returns ok=false without credentials', async () => {
    const result = await sendTelegramMessage('', '');
    expect(result.ok).toBe(false);
  });

  it('returns ok when the Bot API responds ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    try {
      const result = await sendTelegramMessage('123:abc', '456', 'hello');
      expect(result.ok).toBe(true);
      expect(result.updateId).toBe(42);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces the provider description on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, description: 'chat not found' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    try {
      const result = await sendTelegramMessage('123:abc', '456', 'hello');
      expect(result.ok).toBe(false);
      expect(result.message).toBe('chat not found');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
