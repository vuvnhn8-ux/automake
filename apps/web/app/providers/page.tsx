'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface ProviderUsage {
  requests: number;
  success: number;
  failed: number;
  rateLimited: number;
  timeout: number;
  fallbackEvents: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastRequestAt: string | null;
  health: number;
  updatedAt: string;
}

interface ProviderOption {
  id: string;
  label: string;
  requiresKey: boolean;
  isActive: boolean;
  enabled: boolean;
  apiKeySet: boolean;
  keyMask: string | null;
  model: string | null;
  modelEnv: string | null;
  keyEnvSet: boolean;
  openAICompatible: boolean;
  endpoint: string | null;
  usage: ProviderUsage | null;
}

interface ProviderGroup {
  id: string;
  label: string;
  envKey: string;
  envActive: string;
  active: string;
  activeFrom: 'env' | 'db';
  priority: string[];
  catalog: { id: string; label: string; category: string }[];
  options: ProviderOption[];
}

function healthBadge(health: number): { cls: string; level: 'healthy' | 'degraded' | 'poor' } {
  if (health >= 90) return { cls: 'badge ok', level: 'healthy' };
  if (health >= 70) return { cls: 'badge warn', level: 'degraded' };
  return { cls: 'badge danger', level: 'poor' };
}

export default function ProvidersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [groups, setGroups] = useState<ProviderGroup[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = () => {
    api<{ groups: ProviderGroup[] }>('/api/providers')
      .then((d) => setGroups(d.groups))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const isAdmin = user?.role === 'ADMIN';

  return (
    <Shell>
      <h2 style={{ marginTop: 0 }}>{t('providers.title')}</h2>
      <div className="muted" style={{ marginBottom: 20 }}>
        {t('providers.intro')}
      </div>

      {error && <div className="error">{error}</div>}
      {saved && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{saved}</div>}
      {!isAdmin && <div className="muted" style={{ marginBottom: 12 }}>{t('providers.readOnly')}</div>}

      {groups.map((g) => (
        <ProviderGroupCard
          key={g.id}
          group={g}
          admin={isAdmin}
          onChanged={(msg) => {
            setSaved(msg);
            load();
          }}
        />
      ))}
    </Shell>
  );
}

function ProviderGroupCard({
  group,
  admin,
  onChanged,
}: {
  group: ProviderGroup;
  admin: boolean;
  onChanged: (msg: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>{group.label}</strong>
        <span className="muted">
          {t('providers.active', { active: group.active })}{' '}
          {group.activeFrom === 'db'
            ? t('providers.uiOverride')
            : t('providers.envValue', { value: group.envActive })}
        </span>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>{t('providers.provider')}</th>
            <th>{t('providers.status')}</th>
            <th>{t('providers.apiKey')}</th>
            <th>{t('providers.model')}</th>
            <th>{t('providers.usage')}</th>
            <th style={{ width: 320 }}></th>
          </tr>
        </thead>
        <tbody>
          {group.options.map((opt) => (
            <ProviderRow key={opt.id} group={group} opt={opt} admin={admin} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
      <PriorityEditor group={group} admin={admin} onChanged={onChanged} />
    </div>
  );
}

function PriorityEditor({
  group,
  admin,
  onChanged,
}: {
  group: ProviderGroup;
  admin: boolean;
  onChanged: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [priority, setPriority] = useState<string[]>(group.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = (id: string) => group.options.find((o) => o.id === id)?.label ?? id;

  const move = (index: number, dir: -1 | 1) => {
    const next = [...priority];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPriority(next);
  };

  const save = async () => {
    if (!admin) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/providers/priority', { method: 'PUT', body: { group: group.id, priority } });
      onChanged(t('providers.prioritySaved', { group: group.label }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('providers.priorityFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (priority.length < 2 && group.options.length < 2) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            {t('providers.priorityLabel')}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {priority.map((id, i) => (
              <span
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'var(--panel-2)',
                  fontSize: 13,
                }}
              >
                {label(id)}
                {admin && (
                  <span>
                    <button
                      className="btn small link"
                      type="button"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn small link"
                      type="button"
                      disabled={i === priority.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </span>
            ))}
          </div>
          {error && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>
        {admin && (
          <button className="btn small secondary" onClick={() => void save()} disabled={busy}>
            {busy ? '…' : t('providers.savePriority')}
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderRow({
  group,
  opt,
  admin,
  onChanged,
}: {
  group: ProviderGroup;
  opt: ProviderOption;
  admin: boolean;
  onChanged: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(opt.enabled);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(opt.model ?? '');
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState('');

  const setActive = async () => {
    if (!admin) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/providers', { method: 'PUT', body: { group: group.id, provider: opt.id, setActive: true } });
      setEnabled(true);
      onChanged(t('providers.activated', { provider: opt.label, group: group.label }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('providers.activateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin) return;
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { group: group.id, provider: opt.id, enabled };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (model.trim()) body.model = model.trim();
      await api('/api/providers', { method: 'PUT', body });
      onChanged(t('providers.savedSettings', { provider: opt.label }));
      setApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('providers.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!admin) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/providers', { method: 'PUT', body: { group: group.id, provider: opt.id, apiKey: null } });
      onChanged(t('providers.keyCleared', { provider: opt.label }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('providers.clearFailed'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTestMsg(null);
    setError('');
    try {
      const body: Record<string, unknown> = { group: group.id, provider: opt.id };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (model.trim()) body.model = model.trim();
      const r = await api<{ ok: boolean; message?: string }>('/api/providers/test-connection', {
        method: 'POST',
        body,
      });
      setTestMsg({ ok: r.ok, text: r.ok ? t('providers.connectionOk') : (r.message ?? t('providers.testFailed')) });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : t('providers.testFailed') });
    }
  };

  const canTest = group.id === 'AI_TEXT' || group.id === 'RESEARCH';
  const usage = opt.usage;
  const hb = usage ? healthBadge(usage.health) : null;

  return (
    <tr>
      <td>
        <div>{opt.label}</div>
        {opt.isActive && <span className="badge">{t('providers.activeBadge')}</span>}
      </td>
      <td>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!admin || opt.isActive}
            onChange={(e) => setEnabled(e.target.checked)}
          />{' '}
          {t('providers.enabled')}
        </label>
      </td>
      <td>
        {opt.apiKeySet ? (
          <span className="mono">{opt.keyMask ?? '••••••••'} </span>
        ) : opt.keyEnvSet ? (
          <span className="muted">{t('providers.fromEnv')}</span>
        ) : (
          <span className="muted">{t('providers.notSet')}</span>
        )}
        {opt.apiKeySet && admin && (
          <button className="btn small link" onClick={() => void clearKey()} disabled={busy}>
            {t('providers.clear')}
          </button>
        )}
      </td>
      <td>
        {opt.model ? <span className="mono">{opt.model}</span> : opt.modelEnv ? (
          <span className="muted">{t('providers.envModel', { model: opt.modelEnv })}</span>
        ) : (
          <span className="muted">{t('providers.default')}</span>
        )}
      </td>
      <td>
        {usage ? (
          <div style={{ fontSize: 13 }}>
            <span className={hb?.cls} style={{ marginRight: 6 }}>
              {t(`providers.health${hb?.level}` as never, { n: usage.health })}
            </span>
            <div className="muted">
              {t('providers.requestsN', { n: usage.requests })} · {t('providers.successN', { n: usage.success })}
            </div>
            {(usage.failed > 0 || usage.rateLimited > 0 || usage.fallbackEvents > 0) && (
              <div className="muted">
                {t('providers.failedN', { n: usage.failed })} · {t('providers.rateLimitedN', { n: usage.rateLimited })}
                {usage.fallbackEvents > 0 ? ` · ${t('providers.fallbacksN', { n: usage.fallbackEvents })}` : ''}
              </div>
            )}
            {usage.lastError && (
              <div className="error" style={{ fontSize: 12, marginTop: 2 }}>{usage.lastError}</div>
            )}
          </div>
        ) : (
          <span className="muted">{t('providers.noUsage')}</span>
        )}
      </td>
      <td>
        {admin && opt.requiresKey && (
          <form onSubmit={(e) => void save(e)} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input
              type="password"
              placeholder={t('providers.newApiKey')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
            />
            <input
              placeholder={t('providers.modelOptional')}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <button className="btn small" type="submit" disabled={busy || !apiKey.trim()}>
              {t('providers.save')}
            </button>
            {canTest && (
              <button className="btn small secondary" type="button" onClick={() => void test()} disabled={busy}>
                {t('providers.test')}
              </button>
            )}
            {!opt.isActive && (
              <button className="btn small secondary" type="button" onClick={() => void setActive()} disabled={busy}>
                {t('providers.use')}
              </button>
            )}
          </form>
        )}
        {admin && !opt.requiresKey && !opt.isActive && (
          <button className="btn small secondary" type="button" onClick={() => void setActive()} disabled={busy}>
            {t('providers.use')}
          </button>
        )}
        {!admin && (
          <span className="muted">
            {canTest && (
              <button className="btn small secondary" type="button" onClick={() => void test()} disabled={busy}>
                {t('providers.test')}
              </button>
            )}
          </span>
        )}
        {error && <div className="error">{error}</div>}
        {testMsg && <div className={testMsg.ok ? 'muted ok' : 'error'}>{testMsg.text}</div>}
      </td>
    </tr>
  );
}
