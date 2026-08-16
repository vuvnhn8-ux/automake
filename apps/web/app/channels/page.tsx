'use client';

import { useEffect, useState } from 'react';
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
  connectionStatus: string | null;
  tokenStatus: string | null;
  lastCheckedAt: string | null;
  project: { id: string; name: string };
  publishingAccount: { id: string; accountName: string; platform: string; status: string } | null;
  projectAssignments: ProjectAssignment[];
  _count: { series: number; knowledge: number; contents: number };
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

export default function ChannelsPage() {
  const { t } = useI18n();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    api<{ channels: Channel[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const platforms = Array.from(new Set(channels.map((c) => c.platform))).sort();
  const byPlatform = (platform: string) => channels.filter((c) => c.platform === platform);

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t('channels.title')}</h2>
        <span className="muted">{t('channels.subtitle')}</span>
      </div>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {platforms.map((platform) => (
        <div key={platform} className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            <span className="badge accent" style={{ marginRight: 8 }}>{PLATFORM_ICON[platform] ?? '•'}</span>
            {platform}
          </h3>
          <table>
            <thead>
              <tr>
                <th>{t('channels.name')}</th>
                <th>{t('channels.project')}</th>
                <th>{t('channels.assignedProjects')}</th>
                <th>{t('channels.account')}</th>
                <th>{t('channels.contents')}</th>
                <th>{t('channels.connection')}</th>
                <th>{t('channels.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {byPlatform(platform).map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.description && (
                      <div className="muted" style={{ fontSize: 12 }}>{c.description}</div>
                    )}
                  </td>
                  <td className="muted">{c.project.name}</td>
                  <td className="muted">
                    {c.projectAssignments.length > 0
                      ? c.projectAssignments.map((a) => a.project.name).join(', ')
                      : '—'}
                  </td>
                  <td className="muted">{c.publishingAccount ? c.publishingAccount.accountName : '—'}</td>
                  <td>{c._count.contents}</td>
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
                    <TestButton channel={c} onDone={load} />
                  </td>
                </tr>
              ))}
              {byPlatform(platform).length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">{t('channels.noChannels')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {channels.length === 0 && (
        <div className="card muted">
          {t('channels.empty')}
        </div>
      )}
    </Shell>
  );
}
