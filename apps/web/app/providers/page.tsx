'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, useAuth } from '@/lib/auth';

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
}

interface ProviderGroup {
  id: string;
  label: string;
  envKey: string;
  envActive: string;
  active: string;
  activeFrom: 'env' | 'db';
  options: ProviderOption[];
}

export default function ProvidersPage() {
  const { user } = useAuth();
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
      <h2 style={{ marginTop: 0 }}>AI Providers</h2>
      <div className="muted" style={{ marginBottom: 20 }}>
        Manage provider credentials and test connections. Keys are encrypted at rest and never
        returned to the UI. Changes apply without restarting the server.
      </div>

      {error && <div className="error">{error}</div>}
      {saved && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{saved}</div>}
      {!isAdmin && <div className="muted" style={{ marginBottom: 12 }}>Read-only view — admins can edit provider settings.</div>}

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
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>{group.label}</strong>
        <span className="muted">
          Active: <strong>{group.active}</strong>{' '}
          {group.activeFrom === 'db' ? '(UI override)' : `(.env: ${group.envActive})`}
        </span>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Status</th>
            <th>API key</th>
            <th>Model</th>
            <th style={{ width: 320 }}></th>
          </tr>
        </thead>
        <tbody>
          {group.options.map((opt) => (
            <ProviderRow key={opt.id} group={group} opt={opt} admin={admin} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
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
      onChanged(`${opt.label} is now the active ${group.label} provider`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to activate provider');
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
      onChanged(`${opt.label} settings saved`);
      setApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save provider');
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
      onChanged(`${opt.label} API key cleared`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear key');
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
      setTestMsg({ ok: r.ok, text: r.ok ? 'Connection OK' : (r.message ?? 'Failed') });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : 'Test failed' });
    }
  };

  const canTest = group.id === 'AI_TEXT' || group.id === 'RESEARCH';

  return (
    <tr>
      <td>
        <div>{opt.label}</div>
        {opt.isActive && <span className="badge">active</span>}
      </td>
      <td>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!admin || opt.isActive}
            onChange={(e) => setEnabled(e.target.checked)}
          />{' '}
          Enabled
        </label>
      </td>
      <td>
        {opt.apiKeySet ? (
          <span className="mono">{opt.keyMask ?? '••••••••'} </span>
        ) : opt.keyEnvSet ? (
          <span className="muted">from .env</span>
        ) : (
          <span className="muted">not set</span>
        )}
        {opt.apiKeySet && admin && (
          <button className="btn small link" onClick={() => void clearKey()} disabled={busy}>
            clear
          </button>
        )}
      </td>
      <td>
        {opt.model ? <span className="mono">{opt.model}</span> : opt.modelEnv ? (
          <span className="muted">{opt.modelEnv} (.env)</span>
        ) : (
          <span className="muted">default</span>
        )}
      </td>
      <td>
        {admin && opt.requiresKey && (
          <form onSubmit={(e) => void save(e)} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input
              type="password"
              placeholder="New API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
            />
            <input
              placeholder="Model (optional)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <button className="btn small" type="submit" disabled={busy || !apiKey.trim()}>
              Save
            </button>
            {canTest && (
              <button className="btn small secondary" type="button" onClick={() => void test()} disabled={busy}>
                Test
              </button>
            )}
            {!opt.isActive && (
              <button className="btn small secondary" type="button" onClick={() => void setActive()} disabled={busy}>
                Use
              </button>
            )}
          </form>
        )}
        {admin && !opt.requiresKey && !opt.isActive && (
          <button className="btn small secondary" type="button" onClick={() => void setActive()} disabled={busy}>
            Use
          </button>
        )}
        {!admin && (
          <span className="muted">
            {canTest && (
              <button className="btn small secondary" type="button" onClick={() => void test()} disabled={busy}>
                Test
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
