'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface ProjectAssignment {
  projectId: string;
  enabled: boolean;
  project: { id: string; name: string };
}

interface Channel {
  id: string;
  name: string;
  platform: string;
  description: string | null;
  isActive: boolean;
  dailyVideoTarget: number;
  distributionMode: string;
  connectionStatus: string | null;
  tokenStatus: string | null;
  lastCheckedAt: string | null;
  project: { id: string; name: string } | null;
  publishingAccount: { id: string; accountName: string; platform: string; status: string } | null;
  projectAssignments: ProjectAssignment[];
  schedules: { id: string; name: string; times: string[]; days: string[]; timezone: string; status: string; nextRunAt: string | null }[];
  _count: { series: number; knowledge: number; contents: number };
}

const PLATFORMS = ['FACEBOOK', 'YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'X', 'THREADS'];

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

function TestButton({ channel, onDone }: { channel: Channel; onDone: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; message?: string }>(`/api/channels/${channel.id}/test-connection`, {
        method: 'POST',
      });
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? t('channels.connectionOk') : t('channels.testFailed')) });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('channels.testFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span>
      <button className="btn small secondary" onClick={() => void test()} disabled={busy}>
        {busy ? t('channels.testing') : t('channels.test')}
      </button>
      {msg && (
        <div className={msg.ok ? 'muted ok' : 'error'} style={{ fontSize: 12, marginTop: 4 }}>
          {msg.text}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Create-channel wizard — name + platform + platform credentials + settings
// ---------------------------------------------------------------------------

type CredKey =
  | 'appId'
  | 'appSecret'
  | 'pageName'
  | 'pageAccessToken'
  | 'apiKey'
  | 'clientId'
  | 'clientSecret'
  | 'refreshToken'
  | 'channelId'
  | 'clientKey'
  | 'accessToken'
  | 'businessAccountId'
  | 'consumerKey'
  | 'consumerSecret'
  | 'accessTokenSecret';

const CREDENTIAL_FIELDS: Record<string, { key: CredKey; type?: string }[]> = {
  FACEBOOK: [
    { key: 'appId' },
    { key: 'appSecret', type: 'password' },
    { key: 'pageName' },
    { key: 'pageAccessToken', type: 'password' },
  ],
  YOUTUBE: [
    { key: 'apiKey', type: 'password' },
    { key: 'clientId' },
    { key: 'clientSecret', type: 'password' },
    { key: 'refreshToken', type: 'password' },
    { key: 'channelId' },
  ],
  TIKTOK: [
    { key: 'clientKey' },
    { key: 'clientSecret', type: 'password' },
    { key: 'accessToken', type: 'password' },
  ],
  INSTAGRAM: [
    { key: 'accessToken', type: 'password' },
    { key: 'businessAccountId' },
  ],
  X: [
    { key: 'consumerKey', type: 'password' },
    { key: 'consumerSecret', type: 'password' },
    { key: 'accessToken', type: 'password' },
    { key: 'accessTokenSecret', type: 'password' },
  ],
  THREADS: [{ key: 'accessToken', type: 'password' }],
};

function CreateChannelCard({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState('FACEBOOK');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dailyVideoTarget, setDailyVideoTarget] = useState(1);
  const [autoGenerationEnabled, setAutoGenerationEnabled] = useState(false);
  const [distributionMode, setDistributionMode] = useState('SAME_CONTENT');
  const [credFields, setCredFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fields = CREDENTIAL_FIELDS[platform] ?? [];

  const handlePlatform = (p: string) => {
    setPlatform(p);
    setCredFields({});
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const hasCreds = Object.values(credFields).some((v) => v.trim().length > 0);
      await api('/api/channels', {
        method: 'POST',
        body: {
          name: name.trim(),
          platform,
          description: description.trim() || undefined,
          dailyVideoTarget,
          autoGenerationEnabled,
          distributionMode,
          ...(hasCreds ? { credentials: credFields } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('channels.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void create(e)} className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>{t('channels.createTitle')}</h3>
      <div className="muted" style={{ marginBottom: 16 }}>{t('channels.createSubtitle')}</div>

      <div className="field">
        <label>{t('channels.selectPlatform')}</label>
        <div className="wrap" style={{ gap: 6 }}>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn small ${platform === p ? '' : 'secondary'}`}
              onClick={() => handlePlatform(p)}
            >
              <span className="badge accent" style={{ marginRight: 6 }}>{PLATFORM_ICON[p]}</span>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t('channels.channelName')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('channels.channelNamePlaceholder')} required />
      </div>

      {fields.length > 0 && (
        <div className="card subtle" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {t('channels.credsTitle', { platform })}
          </div>
          {fields.map((f) => {
            const labelKey = `channels.cred.${f.key}` as const;
            const label = t(labelKey);
            return (
              <div className="field" key={f.key}>
                <label>{label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={credFields[f.key] ?? ''}
                  onChange={(e) => setCredFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={t('channels.credPlaceholder', { field: label })}
                />
              </div>
            );
          })}
          <div className="muted" style={{ fontSize: 12 }}>
            {t('channels.credsEncrypted')}
          </div>
        </div>
      )}

      <div className="field">
        <label>{t('channels.description')}</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('channels.descriptionPlaceholder')} />
      </div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="field">
          <label>{t('channels.dailyTarget')}</label>
          <input
            type="number"
            min={0}
            max={100}
            value={dailyVideoTarget}
            onChange={(e) => setDailyVideoTarget(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>{t('channels.distribution')}</label>
          <select value={distributionMode} onChange={(e) => setDistributionMode(e.target.value)}>
            <option value="SAME_CONTENT">{t('channels.sameContent')}</option>
            <option value="CHANNEL_VARIANT">{t('channels.channelVariant')}</option>
          </select>
        </div>
      </div>

      <label className="row" style={{ gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input type="checkbox" checked={autoGenerationEnabled} onChange={(e) => setAutoGenerationEnabled(e.target.checked)} />
        <span>{t('channels.autoGeneration')}</span>
      </label>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" type="submit" disabled={busy || !name.trim()}>
          {busy ? '…' : t('channels.create')}
        </button>
        <button className="btn secondary" type="button" onClick={onDone}>{t('channels.cancel')}</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Channels page
// ---------------------------------------------------------------------------

export default function ChannelsPage() {
  const { t } = useI18n();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api<{ channels: Channel[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const visible = useMemo(
    () => (platformFilter === 'ALL' ? channels : channels.filter((c) => c.platform === platformFilter)),
    [channels, platformFilter],
  );

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>{t('channels.title')}</h2>
          <div className="muted">{t('channels.subtitle')}</div>
        </div>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t('channels.cancel') : `+ ${t('channels.addChannel')}`}
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {showCreate && <CreateChannelCard onDone={() => { setShowCreate(false); load(); }} />}

      {channels.length === 0 && !showCreate ? (
        <div className="card">
          <div className="muted" style={{ marginBottom: 12 }}>{t('channels.empty')}</div>
          <button className="btn" onClick={() => setShowCreate(true)}>+ {t('channels.addChannel')}</button>
        </div>
      ) : (
        <>
          <div className="wrap" style={{ gap: 6, marginBottom: 16 }}>
            <button
              className={`btn small ${platformFilter === 'ALL' ? '' : 'secondary'}`}
              onClick={() => setPlatformFilter('ALL')}
            >
              {t('channels.allPlatforms')}
            </button>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                className={`btn small ${platformFilter === p ? '' : 'secondary'}`}
                onClick={() => setPlatformFilter(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t('channels.name')}</th>
                  <th>{t('channels.platform')}</th>
                  <th>{t('channels.destination')}</th>
                  <th>{t('channels.assignedProjects')}</th>
                  <th>{t('channels.contents')}</th>
                  <th>{t('channels.schedules')}</th>
                  <th>{t('channels.connection')}</th>
                  <th>{t('channels.status')}</th>
                  <th>{t('channels.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/channels/${c.id}`}>
                        <strong>{c.name}</strong>
                      </Link>
                      {c.description && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.description}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge accent" style={{ marginRight: 6 }}>{PLATFORM_ICON[c.platform] ?? '•'}</span>
                      <span className="muted">{c.platform}</span>
                    </td>
                    <td className="muted">
                      {c.publishingAccount ? c.publishingAccount.accountName : t('channels.noDestination')}
                    </td>
                    <td className="muted">
                      {c.projectAssignments.length > 0
                        ? c.projectAssignments.map((a) => a.project.name).join(', ')
                        : '—'}
                    </td>
                    <td>{c._count.contents}</td>
                    <td>
                      {c.schedules.length > 0 ? (
                        <div>
                          {c.schedules.map((s) => (
                            <div key={s.id} style={{ fontSize: 12 }}>
                              <span className={`badge ${s.status === 'ACTIVE' ? 'ok' : 'warn'}`} style={{ marginRight: 4 }}>
                                {s.status === 'ACTIVE' ? '●' : '○'}
                              </span>
                              {s.name || s.times.join(', ')}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={connectionClass(c.connectionStatus)}>
                        {c.connectionStatus ?? t('channels.neverTested')}
                      </span>
                      {c.tokenStatus && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.tokenStatus}</div>
                      )}
                      {c.lastCheckedAt && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {t('channels.checkedAt', { date: new Date(c.lastCheckedAt).toLocaleString() })}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>
                        {c.isActive ? t('channels.statusActive') : t('channels.statusDisabled')}
                      </span>
                    </td>
                    <td>
                      <div className="wrap" style={{ gap: 6 }}>
                        <Link href={`/channels/${c.id}`} className="btn small secondary">{t('channels.details')}</Link>
                        <TestButton channel={c} onDone={load} />
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted">{t('channels.noChannels')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
