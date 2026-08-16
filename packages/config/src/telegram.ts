import { prisma } from '@avf/database';
import { SecretCipher } from './cipher.js';

const PREFIX = 'telegram.';

export interface TelegramConfig {
  configured: boolean;
  botTokenSet: boolean;
  chatId: string | null;
  dailyReportEnabled: boolean;
  reportTime: string | null;
  timezone: string | null;
}

/**
 * Load the Telegram configuration from SystemSetting rows. The bot token is
 * stored encrypted via SecretCipher; only its presence is surfaced to clients.
 */
export async function getTelegramConfig(): Promise<TelegramConfig> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: PREFIX } } });
  const map = new Map(rows.map((r) => [r.key.slice(PREFIX.length), r.value]));
  const rawToken = map.get('botToken');
  let botTokenSet = false;
  if (typeof rawToken === 'string' && rawToken) {
    try {
      const cipher = new SecretCipher();
      const token = cipher.decrypt(rawToken);
      botTokenSet = token.length > 0;
    } catch {
      botTokenSet = false;
    }
  }
  return {
    configured: Boolean(map.get('chatId') && botTokenSet),
    botTokenSet,
    chatId: typeof map.get('chatId') === 'string' ? (map.get('chatId') as string) : null,
    dailyReportEnabled: map.get('dailyReportEnabled') === true || map.get('dailyReportEnabled') === 'true',
    reportTime: typeof map.get('reportTime') === 'string' ? (map.get('reportTime') as string) : null,
    timezone: typeof map.get('timezone') === 'string' ? (map.get('timezone') as string) : null,
  };
}

/** Decrypt the stored Telegram bot token, or '' when not configured. */
export async function getTelegramBotToken(): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: `${PREFIX}botToken` } });
  if (!row || typeof row.value !== 'string' || !row.value) return '';
  try {
    return new SecretCipher().decrypt(row.value);
  } catch {
    return '';
  }
}

export interface TelegramSendResult {
  ok: boolean;
  message?: string;
  updateId?: number;
}

/** Send a plain-text message via the Bot API. Never throws. */
export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<TelegramSendResult> {
  if (!token || !chatId) return { ok: false, message: 'Telegram is not configured' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
      });
      const body = (await response.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
      if (!response.ok || body.ok === false) {
        return { ok: false, message: body.description ?? `HTTP ${response.status}` };
      }
      return { ok: true, updateId: body.result?.message_id };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Telegram request failed' };
  }
}

/** Load config + send a message to the configured chat (no-op when disabled). */
export async function sendTelegramNotification(text: string): Promise<TelegramSendResult> {
  const config = await getTelegramConfig();
  if (!config.configured || !config.chatId) return { ok: false, message: 'Telegram is not configured' };
  const token = await getTelegramBotToken();
  return sendTelegramMessage(token, config.chatId, text);
}

export const TELEGRAM_PREFIX = PREFIX;
