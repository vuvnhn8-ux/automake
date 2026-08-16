'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export interface PublishingJob {
  id: string;
  status: string;
  phase: string;
  retryCount: number;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  facebookPostId: string | null;
  videoId: string;
  videoTitle: string | null;
  videoStatus: string | null;
  projectId: string | null;
  projectName: string | null;
  channelName: string | null;
  platform: string;
}

interface Summary {
  jobsToday: number;
  publishedToday: number;
  scheduled: number;
  processing: number;
  failedToday: number;
  retrying: number;
}

const PHASES = ['ALL', 'QUEUED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED'];

function phaseKey(phase: string): string {
  return `pjobs.${phase.toLowerCase()}` as never;
}

function badgeClass(phase: string): string {
  switch (phase) {
    case 'PUBLISHED':
      return 'badge ok';
    case 'FAILED':
    case 'CANCELLED':
      return 'badge danger';
    case 'PUBLISHING':
      return 'badge';
    default:
      return 'badge warn';
  }
}

export default function PublishingJobsMonitor() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<PublishingJob[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string; platform: string }[]>([]);
  const [phase, setPhase] = useState('ALL');
  const [projectId, setProjectId] = useState('');
  const [platform, setPlatform] = useState('ALL');
  const [channelId, setChannelId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (phase !== 'ALL') params.set('status', phase);
    if (projectId) params.set('projectId', projectId);
    if (platform !== 'ALL') params.set('platform', platform);
    if (channelId) params.set('channelId', channelId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api<{ jobs: PublishingJob[]; summary: Summary }>(`/api/publishing-jobs?${params.toString()}`)
      .then((d) => {
        setJobs(d.jobs);
        setSummary(d.summary);
      })
      .catch((e) => setError(e.message));
  }, [phase, projectId, platform, channelId, from, to]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/api/publishing-jobs/projects')
      .then((d) => setProjects(d.projects))
      .catch(() => undefined);
    api<{ channels: { id: string; name: string; platform: string }[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch(() => undefined);
  }, []);

  const platforms = Array.from(new Set((jobs ?? []).map((j) => j.platform))).sort();

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{t('pjobs.title')}</h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {t('pjobs.subtitle')}
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {t(`pjobs.${p.toLowerCase()}` as never)}
              </option>
            ))}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('pjobs.allProjects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="ALL">{t('pjobs.allPlatforms')}</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">{t('pjobs.allChannels')}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            title={t('pjobs.from')}
            aria-label={t('pjobs.from')}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            title={t('pjobs.to')}
            aria-label={t('pjobs.to')}
          />
          <button className="btn small secondary" onClick={load}>
            {t('pjobs.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {summary && (
        <div className="stat" style={{ margin: '16px 0' }}>
          <div className="stat-item">
            <div className="value">{summary.jobsToday}</div>
            <div className="label">{t('pjobs.jobsToday')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.publishedToday}</div>
            <div className="label">{t('pjobs.publishedToday')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.scheduled}</div>
            <div className="label">{t('pjobs.scheduled')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.processing}</div>
            <div className="label">{t('pjobs.processing')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.failedToday}</div>
            <div className="label">{t('pjobs.failedToday')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{summary.retrying}</div>
            <div className="label">{t('pjobs.retrying')}</div>
          </div>
        </div>
      )}

      {jobs === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : jobs.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('pjobs.noJobs')}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('pjobs.video')}</th>
              <th>{t('pjobs.project')}</th>
              <th>{t('pjobs.channel')}</th>
              <th>{t('pjobs.platform')}</th>
              <th>{t('pjobs.status')}</th>
              <th>{t('pjobs.phase')}</th>
              <th>{t('pjobs.scheduledAt')}</th>
              <th>{t('pjobs.retries')}</th>
              <th>{t('pjobs.error')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>
                  <strong>{j.videoTitle ?? t('common.untitled')}</strong>
                  {j.videoStatus && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t('pjobs.videoStatus', { status: j.videoStatus })}
                    </div>
                  )}
                </td>
                <td className="muted">{j.projectName ?? '—'}</td>
                <td className="muted">{j.channelName ?? '—'}</td>
                <td className="muted">{j.platform}</td>
                <td>
                  <span className="muted" style={{ fontSize: 13 }}>{j.status}</span>
                </td>
                <td>
                  <span className={badgeClass(j.phase)}>{t(phaseKey(j.phase) as never)}</span>
                </td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : t('pjobs.asap')}
                </td>
                <td>{j.retryCount > 0 ? j.retryCount : '—'}</td>
                <td className="muted" style={{ maxWidth: 260, fontSize: 12 }}>
                  {j.errorMessage ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
