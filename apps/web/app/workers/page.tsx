'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface WorkerRow {
  workerId: string;
  hostname: string;
  status: string;
  currentJob: string | null;
  version: string | null;
  concurrency: number;
  ffmpegAvailable: boolean;
  lastSeenAt: string;
  online: boolean;
}

interface Summary {
  total: number;
  online: number;
  draining: number;
  processing: number;
}

export default function WorkersPage() {
  const { t } = useI18n();
  const [workers, setWorkers] = useState<WorkerRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ workers: WorkerRow[]; summary: Summary }>('/api/workers')
      .then((d) => {
        setWorkers(d.workers);
        setSummary(d.summary);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Shell>
        <div className="error">{error}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t('workers.title')}</h2>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        {t('workers.subtitle')}
      </p>

      {summary && (
        <div className="stat" style={{ marginBottom: 24 }}>
          <div className="stat-item">
            <div className="value">{summary.total}</div>
            <div className="label">{t('workers.total')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.online}</div>
            <div className="label">{t('workers.online')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.draining}</div>
            <div className="label">{t('workers.draining')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.processing}</div>
            <div className="label">{t('workers.processing')}</div>
          </div>
        </div>
      )}

      {workers === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : workers.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>
            {t('workers.empty')}
          </p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{t('workers.worker')}</th>
                <th>{t('workers.hostname')}</th>
                <th>{t('workers.status')}</th>
                <th>{t('workers.currentJob')}</th>
                <th>{t('workers.version')}</th>
                <th>{t('workers.concurrency')}</th>
                <th>{t('workers.ffmpeg')}</th>
                <th>{t('workers.lastSeen')}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.workerId}>
                  <td>{w.workerId}</td>
                  <td>{w.hostname}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: w.online ? 'var(--ok-bg)' : 'var(--panel-2)',
                        color: w.online ? 'var(--ok)' : 'var(--muted)',
                      }}
                    >
                      {w.online ? w.status : t('workers.offline')}
                    </span>
                  </td>
                  <td>{w.currentJob ?? '—'}</td>
                  <td>{w.version ?? '—'}</td>
                  <td>{w.concurrency}</td>
                  <td>{w.ffmpegAvailable ? t('workers.yes') : t('workers.no')}</td>
                  <td>{new Date(w.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
