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

export function clearProviderConfigCache(): void {
  cache = null;
  lastLoaded = 0;
}
