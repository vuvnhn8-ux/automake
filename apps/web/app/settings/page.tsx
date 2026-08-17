'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Setting {
  key: string;
  value: unknown;
  description?: string | null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
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
      setSaved(t('settings.saved', { key: s.key }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.saveFailed'));
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/api/settings', { method: 'PUT', body: { key: newKey, value: JSON.parse(newValue) } });
      setNewKey('');
      setNewValue('');
      setSaved(t('settings.created', { key: newKey }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.createFailed'));
    }
  };

  return (
    <Shell>
      <h2 style={{ marginTop: 0 }}>{t('settings.title')}</h2>
      <div className="muted" style={{ marginBottom: 20 }}>
        {t('settings.signedInAs', { email: user?.email ?? '', role: user?.role ?? '' })}
      </div>

      {error && <div className="error">{error}</div>}
      {saved && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{saved}</div>}

      <SectionTitle>{t('settings.groupAccount')}</SectionTitle>
      <ChangePasswordForm onChanged={(msg) => setSaved(msg)} />

      <SectionTitle>{t('settings.groupNotifications')}</SectionTitle>
      <TelegramCard onChanged={(msg) => setSaved(msg)} />

      <SectionTitle>{t('settings.groupSystem')}</SectionTitle>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t('settings.systemTitle')}</h3>
        <div className="muted" style={{ marginBottom: 16 }}>
          {t('settings.systemIntro')}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href="/providers" className="btn secondary small">{t('settings.linkProviders')}</Link>
          <Link href="/workers" className="btn secondary small">{t('settings.linkWorkers')}</Link>
          <Link href="/channels" className="btn secondary small">{t('settings.linkChannels')}</Link>
        </div>
      </div>

      <SectionTitle>{t('settings.groupMaintenance')}</SectionTitle>
      <form onSubmit={(e) => void add(e)} className="card" style={{ marginBottom: 20 }}>
        <div className="row">
          <input placeholder={t('settings.keyPlaceholder')} value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ flex: 1 }} />
          <input placeholder={t('settings.valuePlaceholder')} value={newValue} onChange={(e) => setNewValue(e.target.value)} style={{ flex: 2 }} />
          <button className="btn" type="submit" disabled={!newKey.trim() || !newValue.trim()}>
            {t('settings.addUpdate')}
          </button>
        </div>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('settings.key')}</th>
              <th>{t('settings.valueJson')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <SettingRow key={s.key} setting={s} onSave={save} />
            ))}
            {settings.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">{t('settings.noSettings')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: '28px 0 12px', textTransform: 'uppercase', fontSize: 12, letterSpacing: 1 }}>{children}</h3>;
}

function SettingRow({ setting, onSave }: { setting: Setting; onSave: (s: Setting, value: string) => Promise<void> }) {
  const { t } = useI18n();
  const [value, setValue] = useState(() => JSON.stringify(setting.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialRef = useRef(setting.value);

  useEffect(() => {
    if (setting.value !== initialRef.current) {
      initialRef.current = setting.value;
      setValue(JSON.stringify(setting.value));
    }
  }, [setting.value]);

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
              setError(e instanceof Error ? e.message : t('settings.invalidJson'));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '…' : t('settings.save')}
        </button>
      </td>
    </tr>
  );
}

function ChangePasswordForm({ onChanged }: { onChanged: (msg: string) => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next, newPasswordConfirm: confirm },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged(t('settings.pwUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.pwFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t('settings.accountSecurity')}</h3>
      <div className="muted" style={{ marginBottom: 16 }}>
        {t('settings.pwIntro')}
      </div>
      <form onSubmit={(e) => void submit(e)} className="grid" style={{ maxWidth: 460 }}>
        <div className="field">
          <label htmlFor="current-password">{t('settings.currentPassword')}</label>
          <input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">{t('settings.newPassword')}</label>
          <input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">{t('settings.confirmPassword')}</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <div>
          <button className="btn" type="submit" disabled={busy || !current || !next || !confirm}>
            {busy ? t('settings.updating') : t('settings.changePassword')}
          </button>
        </div>
      </form>
    </div>
  );
}

interface TelegramConfig {
  configured: boolean;
  botTokenSet: boolean;
  chatId: string | null;
  dailyReportEnabled: boolean;
  reportTime: string | null;
  timezone: string | null;
}

function TelegramCard({ onChanged }: { onChanged: (msg: string) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [dailyReportEnabled, setDailyReportEnabled] = useState(false);
  const [reportTime, setReportTime] = useState('07:00');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    api<{ config: TelegramConfig }>('/api/settings/telegram')
      .then((d) => {
        setConfig(d.config);
        setChatId(d.config.chatId ?? '');
        setDailyReportEnabled(d.config.dailyReportEnabled);
        setReportTime(d.config.reportTime ?? '07:00');
        setTimezone(d.config.timezone ?? 'Asia/Ho_Chi_Minh');
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        chatId: chatId.trim() || null,
        dailyReportEnabled,
        reportTime: reportTime.trim() || null,
        timezone: timezone.trim() || null,
      };
      if (botToken.trim()) body.botToken = botToken.trim();
      await api('/api/settings/telegram', { method: 'PUT', body });
      setBotToken('');
      onChanged(t('settings.telegramSaved'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.telegramSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const clearToken = async () => {
    if (!isAdmin) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/settings/telegram', { method: 'PUT', body: { botToken: null } });
      onChanged(t('settings.telegramTokenCleared'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.telegramSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTestMsg(null);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (botToken.trim()) body.botToken = botToken.trim();
      if (chatId.trim()) body.chatId = chatId.trim();
      const r = await api<{ ok: boolean; message?: string }>('/api/settings/telegram/test', {
        method: 'POST',
        body,
      });
      setTestMsg({ ok: r.ok, text: r.ok ? t('settings.telegramTestOk') : (r.message ?? t('settings.telegramTestFailed')) });
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : t('settings.telegramTestFailed') });
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t('settings.telegramTitle')}</h3>
      <div className="muted" style={{ marginBottom: 16 }}>
        {t('settings.telegramIntro')}
      </div>

      {error && <div className="error">{error}</div>}

      {config && config.configured && (
        <div className="muted" style={{ marginBottom: 12, color: 'var(--ok)' }}>
          {t('settings.telegramConfigured')}
        </div>
      )}

      <form onSubmit={(e) => void save(e)} className="grid" style={{ maxWidth: 560 }}>
        <div className="field">
          <label htmlFor="tg-token">{t('settings.telegramBotToken')}</label>
          <input
            id="tg-token"
            type="password"
            placeholder={config?.botTokenSet ? '•••••••• (set)' : t('settings.telegramTokenPlaceholder')}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            autoComplete="new-password"
            disabled={!isAdmin}
          />
          {config?.botTokenSet && isAdmin && (
            <button className="btn small link" type="button" onClick={() => void clearToken()} disabled={busy}>
              {t('settings.telegramClearToken')}
            </button>
          )}
        </div>
        <div className="field">
          <label htmlFor="tg-chat">{t('settings.telegramChatId')}</label>
          <input
            id="tg-chat"
            type="text"
            placeholder="123456789"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
        <div className="field">
          <label htmlFor="tg-time">{t('settings.telegramReportTime')}</label>
          <input
            id="tg-time"
            type="time"
            value={reportTime}
            onChange={(e) => setReportTime(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
        <div className="field">
          <label htmlFor="tg-tz">{t('settings.telegramTimezone')}</label>
          <input
            id="tg-tz"
            type="text"
            placeholder="Asia/Ho_Chi_Minh"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>
            <input
              type="checkbox"
              checked={dailyReportEnabled}
              onChange={(e) => setDailyReportEnabled(e.target.checked)}
              disabled={!isAdmin}
            />{' '}
            {t('settings.telegramDailyReport')}
          </label>
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? '…' : t('settings.save')}
            </button>
            <button className="btn small secondary" type="button" onClick={() => void test()} disabled={busy}>
              {t('settings.telegramTest')}
            </button>
          </div>
        )}
        {!isAdmin && <div className="muted">{t('settings.telegramReadOnly')}</div>}
        {testMsg && <div className={testMsg.ok ? 'muted ok' : 'error'}>{testMsg.text}</div>}
      </form>
    </div>
  );
}
