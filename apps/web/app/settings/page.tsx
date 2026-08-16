'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, useAuth } from '@/lib/auth';

interface Setting {
  key: string;
  value: unknown;
  description?: string | null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = () => {
    api<{ settings: Setting[] }>('/api/settings')
      .then((d) => setSettings(d.settings))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const save = async (s: Setting, value: string) => {
    setError('');
    try {
      await api('/api/settings', { method: 'PUT', body: { key: s.key, value: JSON.parse(value) } });
      setSaved(`Saved ${s.key}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save setting (value must be valid JSON)');
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/api/settings', { method: 'PUT', body: { key: newKey, value: JSON.parse(newValue) } });
      setNewKey('');
      setNewValue('');
      setSaved(`Created ${newKey}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create setting');
    }
  };

  return (
    <Shell>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div className="muted" style={{ marginBottom: 20 }}>
        Signed in as <strong>{user?.email}</strong> ({user?.role}). System settings are stored in the database.
      </div>

      {error && <div className="error">{error}</div>}
      {saved && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{saved}</div>}

      <form onSubmit={(e) => void add(e)} className="card" style={{ marginBottom: 20 }}>
        <div className="row">
          <input placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ flex: 1 }} />
          <input placeholder='value (JSON), e.g. "vi-VN" or 60' value={newValue} onChange={(e) => setNewValue(e.target.value)} style={{ flex: 2 }} />
          <button className="btn" type="submit" disabled={!newKey.trim() || !newValue.trim()}>
            Add / update
          </button>
        </div>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value (JSON)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <SettingRow key={s.key} setting={s} onSave={save} />
            ))}
            {settings.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">No settings stored yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function SettingRow({ setting, onSave }: { setting: Setting; onSave: (s: Setting, value: string) => Promise<void> }) {
  const [value, setValue] = useState(() => JSON.stringify(setting.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  return (
    <tr>
      <td className="mono">{setting.key}</td>
      <td>
        <input value={value} onChange={(e) => setValue(e.target.value)} className="mono" />
        {error && <div className="error">{error}</div>}
      </td>
      <td>
        <button
          className="btn small secondary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await onSave(setting, value);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Invalid JSON');
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
