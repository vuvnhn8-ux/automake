import { prisma } from '@avf/database';
import { SecretCipher } from './cipher.js';

const PREFIX = 'provider.';

export interface ProviderSetting {
  provider: string;
  enabled: boolean;
  apiKey: string | null;
  apiKeySet: boolean;
  model: string | null;
  custom?: Record<string, string>;
}

let cache: Record<string, ProviderSetting> | null = null;
let lastLoaded = 0;

/**
 * Load DB-backed provider overrides from SystemSetting rows with the
 * `provider.` key prefix. Values are stored encrypted via SecretCipher.
 *
 * Overrides always WIN over .env values so the UI can fully manage provider
 * credentials without SSH/VPS access. Falls back to empty map when the
 * database is unreachable (tests / worker before boot).
 */
export async function loadProviderConfig(): Promise<void> {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { startsWith: PREFIX } },
    });
    const cipher = new SecretCipher();
    const next: Record<string, ProviderSetting> = {};
    for (const row of rows) {
      const key = row.key.slice(PREFIX.length);
      const dot = key.indexOf('.');
      if (dot === -1) continue;
      const provider = key.slice(0, dot);
      const field = key.slice(dot + 1);
      if (!provider) continue;
      next[provider] ??= {
        provider,
        enabled: true,
        apiKey: null,
        apiKeySet: false,
        model: null,
      };
      const setting = next[provider];
      const value = row.value;
      if (field === 'enabled') {
        setting.enabled = value === true || value === 'true';
      } else if (field === 'apiKey' && typeof value === 'string' && value) {
        try {
          setting.apiKey = cipher.decrypt(value);
          setting.apiKeySet = true;
        } catch {
          setting.apiKey = null;
          setting.apiKeySet = false;
        }
      } else if (field === 'model' && typeof value === 'string' && value) {
        setting.model = value;
      } else if (field && typeof value === 'string' && value) {
        setting.custom ??= {};
        setting.custom[field] = value;
      }
    }
    cache = next;
    lastLoaded = Date.now();
  } catch {
    cache = {};
    lastLoaded = Date.now();
  }
}

/** Reload the DB-backed provider config if it has not been refreshed recently. */
export async function refreshProviderConfig(ttlMs = 60_000): Promise<void> {
  if (cache === null || Date.now() - lastLoaded > ttlMs) {
    await loadProviderConfig();
  }
}

/**
 * Resolve the active provider id for a provider group from DB overrides
 * (`provider.<group>.active`), falling back to the env-selected provider.
 */
export function getActiveProvider(group: string, envProvider: string): string {
  if (cache === null) return envProvider;
  const groupSetting = cache[group];
  return groupSetting?.custom?.active ?? envProvider;
}

export function getProviderSetting(provider: string): ProviderSetting | null {
  if (cache === null) return null;
  return cache[provider] ?? null;
}

/**
 * Priority chain for a group (e.g. `provider.AI_TEXT.priority`). Stored as a
 * JSON array of provider ids; falls back to the env active provider.
 */
export function getProviderPriority(group: string, envProvider: string): string[] {
  if (cache === null) return [envProvider];
  const groupSetting = cache[group];
  const raw = groupSetting?.custom?.priority;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((x): x is string => typeof x === 'string');
        if (ids.length > 0) return ids;
      }
    } catch {
      /* malformed priority — fall through to env default */
    }
  }
  return [envProvider];
}

export function clearProviderConfigCache(): void {
  cache = null;
  lastLoaded = 0;
}

/**
 * Persist a provider pool call into the ProviderUsage counter row. Used by the
 * worker (and manual API actions) so the dashboard can show per-provider
 * health/quota. Never throws.
 */
export async function recordProviderUsage(params: {
  group: string;
  provider: string;
  model?: string | null;
  ok: boolean;
  errorClass?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  fallbackCount?: number;
}): Promise<void> {
  const { group, provider, ok } = params;
  const errorClass = params.errorClass ?? null;
  const now = new Date();
  try {
    const existing = await prisma.providerUsage.findUnique({
      where: { group_provider: { group, provider } },
    });
    const health = deriveHealth({
      success: (existing?.success ?? 0) + (ok ? 1 : 0),
      failed: (existing?.failed ?? 0) + (ok ? 0 : 1),
      rateLimited: (existing?.rateLimited ?? 0) + (errorClass === 'RATE_LIMIT' ? 1 : 0),
      timeout: (existing?.timeout ?? 0) + (errorClass === 'TIMEOUT' ? 1 : 0),
      lastErrorClass: ok ? null : (errorClass ?? 'UNKNOWN'),
    });
    await prisma.providerUsage.upsert({
      where: { group_provider: { group, provider } },
      update: {
        model: params.model ?? null,
        requests: { increment: 1 },
        success: ok ? { increment: 1 } : undefined,
        failed: ok ? undefined : { increment: 1 },
        rateLimited: errorClass === 'RATE_LIMIT' ? { increment: 1 } : undefined,
        timeout: errorClass === 'TIMEOUT' ? { increment: 1 } : undefined,
        fallbackEvents: { increment: params.fallbackCount ?? 0 },
        lastError: ok ? null : (errorClass ?? null),
        lastErrorClass: ok ? null : (errorClass ?? 'UNKNOWN'),
        lastSuccessAt: ok ? now : undefined,
        lastRequestAt: now,
        health,
      },
      create: {
        group,
        provider,
        model: params.model ?? null,
        requests: 1,
        success: ok ? 1 : 0,
        failed: ok ? 0 : 1,
        rateLimited: errorClass === 'RATE_LIMIT' ? 1 : 0,
        timeout: errorClass === 'TIMEOUT' ? 1 : 0,
        fallbackEvents: params.fallbackCount ?? 0,
        lastError: ok ? null : (errorClass ?? null),
        lastErrorClass: ok ? null : (errorClass ?? 'UNKNOWN'),
        lastSuccessAt: ok ? now : null,
        lastRequestAt: now,
        health,
      },
    });
  } catch (err) {
    console.error('[config] failed to record provider usage:', err);
  }
}

function deriveHealth(u: {
  success: number;
  failed: number;
  rateLimited: number;
  timeout: number;
  lastErrorClass: string | null;
}): string {
  if (u.rateLimited > 2) return 'RATE_LIMITED';
  if (u.timeout > 2) return 'DEGRADED';
  if (u.failed >= 1 && u.success === 0) return 'ERROR';
  if (u.failed > 5) return 'DEGRADED';
  return u.success > 0 ? 'HEALTHY' : 'UNKNOWN';
}
