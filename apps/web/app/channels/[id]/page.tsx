'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Destination {
  id: string;
  accountName?: string;
  pageName?: string;
  platform?: string;
  status?: string;
  hasCredentials?: boolean;
  credentialsMask?: string;
}

interface Assignment {
  id: string;
  enabled: boolean;
  priority: number;
  project: { id: string; name: string };
}

interface Schedule {
  id: string;
  name: string;
  times: string[];
  days: string[];
  timezone: string;
  status: string;
  nextRunAt: string | null;
}

interface PublishingJob {
  id: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  video: { id: string; content: { id: string; title: string | null } };
}

interface Channel {
  id: string;
  name: string;
  platform: string;
  description: string | null;
  isActive: boolean;
  dailyVideoTarget: number;
  autoGenerationEnabled: boolean;
  distributionMode: string;
  connectionStatus: string | null;
  tokenStatus: string | null;
  lastCheckedAt: string | null;
  facebookPage: Destination | null;
  publishingAccount: Destination | null;
  projectAssignments: Assignment[];
  schedules: Schedule[];
  publishingJobs: PublishingJob[];
  _count: { contents: number; schedules: number };
}

const PLATFORM_ICON: Record<string, string> = {
  FACEBOOK: 'FB',
  YOUTUBE: 'YT',
  TIKTOK: 'TT',
  INSTAGRAM: 'IG',
  X: 'X',
  THREADS: 'TH',
  OTHER: '•',
};

function connectionClass(status: string | null): string {
  if (status === 'CONNECTED') return 'badge ok';
  if (status === 'ERROR') return 'badge danger';
  return 'badge warn';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError('');
    api<{ channel: Channel }>(`/api/channels/${id}`)
      .then((d) => setChannel(d.channel))
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (!channel) {
    return (
      <Shell>
        <div className="muted">{t('channels.loading')}</div>
        {error && <div className="error">{error}</div>}
      </Shell>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('channels.testFailed'));
    } finally {
      setBusy(false);
    }
  };

  const destination = channel.publishingAccount ?? channel.facebookPage;
  const destinationName =
    channel.publishingAccount?.accountName ?? channel.facebookPage?.pageName ?? null;

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Link href="/channels" className="muted" style={{ fontSize: 13 }}>
            ← {t('channels.backChannels')}
          </Link>
          <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 4 }}>
            <span className="badge accent" style={{ fontSize: 14 }}>{PLATFORM_ICON[channel.platform] ?? '•'}</span>
            <h2 style={{ margin: 0 }}>{channel.name}</h2>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {channel.platform} · {t('channels.meta', {
              target: channel.dailyVideoTarget,
              contents: channel._count.contents,
              schedules: channel._count.schedules,
            })}
          </div>
        </div>
        <div className="wrap" style={{ gap: 8 }}>
          <span className={connectionClass(channel.connectionStatus)}>
            {channel.connectionStatus ?? t('channels.neverTested')}
          </span>
          <span className={`badge ${channel.isActive ? 'ok' : 'warn'}`}>
            {channel.isActive ? t('channels.statusActive') : t('channels.statusDisabled')}
          </span>
          <button
            className="btn small secondary"
            disabled={busy}
            onClick={() => void run(() => api(`/api/channels/${channel.id}/test-connection`, { method: 'POST' }))}
          >
            {t('channels.test')}
          </button>
          <button className="btn small secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
            {editing ? t('channels.cancel') : t('channels.edit')}
          </button>
          {destinationName && (
            <button
              className="btn small secondary"
              disabled={busy}
              onClick={() => {
                if (confirm(t('channels.disconnectConfirm'))) {
                  void run(() => api(`/api/channels/${channel.id}/disconnect`, { method: 'POST' }));
                }
              }}
            >
              {t('channels.disconnect')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{notice}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', alignItems: 'start' }}>
        {editing ? (
          <EditCard channel={channel} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
        ) : (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t('channels.name')}</h3>
            <dl style={{ margin: 0 }}>
              <dt className="muted">{t('channels.platform')}</dt>
              <dd>{channel.platform}</dd>
              <dt className="muted">{t('channels.descriptionPlaceholder')}</dt>
              <dd>{channel.description ?? '—'}</dd>
              <dt className="muted">{t('channels.dailyTarget')}</dt>
              <dd>{channel.dailyVideoTarget}</dd>
              <dt className="muted">{t('channels.distribution')}</dt>
              <dd>
                {channel.distributionMode === 'CHANNEL_VARIANT'
                  ? t('channels.channelVariant')
                  : t('channels.sameContent')}
                <div className="muted" style={{ fontSize: 12 }}>{t('channels.distributionHint')}</div>
              </dd>
              <dt className="muted">{t('channels.autoGeneration')}</dt>
              <dd>{channel.autoGenerationEnabled ? 'ON' : 'OFF'}</dd>
              <dt className="muted">{t('channels.connection')}</dt>
              <dd>
                {channel.connectionStatus ?? t('channels.neverTested')}
                {channel.tokenStatus && <div className="muted" style={{ fontSize: 12 }}>{channel.tokenStatus}</div>}
                {channel.lastCheckedAt && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t('channels.checkedAt', { date: new Date(channel.lastCheckedAt).toLocaleString() })}
                  </div>
                )}
              </dd>
            </dl>
          </div>
        )}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('channels.destination')}</h3>
          {destination ? (
            <div>
              <div className="spread">
                <strong>{destinationName}</strong>
                <span className={`badge ${destination.status === 'CONNECTED' ? 'ok' : 'warn'}`}>
                  {destination.status}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {destination.hasCredentials ? t('channels.hasCredentials') : t('channels.noCredentials')}
              </div>
              {destination.credentialsMask && (
                <code style={{ fontSize: 13 }}>{destination.credentialsMask}</code>
              )}
            </div>
          ) : (
            <div className="muted">{t('channels.noDestination')}</div>
          )}

          <h3 style={{ marginBottom: 8 }}>{t('channels.assignedProjects')}</h3>
          {channel.projectAssignments.length > 0 ? (
            channel.projectAssignments.map((a) => (
              <div key={a.id} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{a.project.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{t('pct.priority')}: {a.priority}</span>
              </div>
            ))
          ) : (
            <div className="muted">{t('pct.noGlobalChannels')}</div>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', alignItems: 'start', marginTop: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('channels.schedules')}</h3>
          {channel.schedules.length > 0 ? (
            channel.schedules.map((s) => (
              <div key={s.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div>{s.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.times.join(', ')} · {s.days.length ? s.days.join(', ') : t('channels.everyDay')} · {s.timezone}
                    {s.nextRunAt ? ` · ${t('pct.next', { date: new Date(s.nextRunAt).toLocaleString() })}` : ''}
                  </div>
                </div>
                <span className={`badge ${s.status === 'ACTIVE' ? 'ok' : 'warn'}`}>{s.status}</span>
              </div>
            ))
          ) : (
            <div className="muted">{t('channels.noSchedules')}</div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('channels.recentJobs')}</h3>
          {channel.publishingJobs.length > 0 ? (
            channel.publishingJobs.map((j) => (
              <div key={j.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div>{j.video.content.title ?? t('pct.untitled')}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {j.status}
                    {j.scheduledAt ? ` · ${new Date(j.scheduledAt).toLocaleString()}` : ''}
                  </div>
                </div>
                <span className={`badge ${j.status === 'PUBLISHED' ? 'ok' : j.status === 'FAILED' ? 'danger' : 'warn'}`}>
                  {j.status}
                </span>
              </div>
            ))
          ) : (
            <div className="muted">{t('channels.noJobs')}</div>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Edit card
// ---------------------------------------------------------------------------

function EditCard({ channel, onCancel, onSaved }: { channel: Channel; onCancel: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? '');
  const [dailyVideoTarget, setDailyVideoTarget] = useState(channel.dailyVideoTarget);
  const [autoGenerationEnabled, setAutoGenerationEnabled] = useState(channel.autoGenerationEnabled);
  const [distributionMode, setDistributionMode] = useState(channel.distributionMode);
  const [isActive, setIsActive] = useState(channel.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        body: {
          name,
          description: description.trim() || undefined,
          dailyVideoTarget,
          autoGenerationEnabled,
          distributionMode,
          isActive,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('channels.testFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="card">
      <h3 style={{ marginTop: 0 }}>{t('channels.edit')}</h3>
      <Field label={t('channels.name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label={t('channels.descriptionPlaceholder')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Field label={t('channels.dailyTarget')}>
          <input type="number" min={0} max={100} value={dailyVideoTarget} onChange={(e) => setDailyVideoTarget(Number(e.target.value))} style={{ width: 90 }} />
        </Field>
        <Field label={t('channels.distribution')}>
          <select value={distributionMode} onChange={(e) => setDistributionMode(e.target.value)}>
            <option value="SAME_CONTENT">{t('channels.sameContent')}</option>
            <option value="CHANNEL_VARIANT">{t('channels.channelVariant')}</option>
          </select>
        </Field>
      </div>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={autoGenerationEnabled} onChange={(e) => setAutoGenerationEnabled(e.target.checked)} />
        <span>{t('channels.autoGeneration')}</span>
      </label>
      <label className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>{t('channels.statusActive')}</span>
      </label>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        <button className="btn" type="submit" disabled={busy || !name.trim()}>{busy ? '…' : t('channels.save')}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t('channels.cancel')}</button>
      </div>
    </form>
  );
}
