'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Video {
  id: string;
  title: string;
  status: string;
  template: string;
  resolution: string;
  durationSeconds?: number | null;
  qualityScore?: number | null;
  createdAt: string;
  publishedAt?: string | null;
  project: { id: string; name: string };
  publishingJobs: { id: string; status: string; scheduledAt?: string | null }[];
}

export default function VideosPage() {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    api<{ videos: Video[] }>('/api/videos', { params: { status: status || undefined, limit: '100' } })
      .then((d) => setVideos(d.videos))
      .catch((e) => setError(e.message));
  }, [status]);

  const badge = (s: string) =>
    s === 'READY' || s === 'PUBLISHED' ? 'ok' : s === 'FAILED' ? 'danger' : s.includes('ING') || s === 'PENDING' || s === 'DRAFT' ? 'warn' : '';

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t('videos.title')}</h2>
        <div className="row">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">{t('videos.allStatuses')}</option>
            <option>DRAFT</option>
            <option>GENERATING</option>
            <option>RENDERING</option>
            <option>READY</option>
            <option>NEEDS_REVIEW</option>
            <option>FAILED</option>
          </select>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('videos.titleCol')}</th>
              <th>{t('videos.project')}</th>
              <th>{t('videos.status')}</th>
              <th>{t('videos.template')}</th>
              <th>{t('videos.quality')}</th>
              <th>{t('videos.created')}</th>
              <th>{t('videos.publish')}</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/videos/${v.id}`} style={{ color: 'var(--accent)' }}>
                    {v.title}
                  </Link>
                </td>
                <td className="muted">{v.project.name}</td>
                <td>
                  <span className={`badge ${badge(v.status)}`}>{v.status}</span>
                  {v.publishingJobs.map((j) => (
                    <div key={j.id} className="mono" style={{ marginTop: 2 }}>
                      {t('videos.post')} <span className={`badge ${badge(j.status)}`}>{j.status}</span>
                    </div>
                  ))}
                </td>
                <td className="mono">{v.template}</td>
                <td>{v.qualityScore ?? '—'}</td>
                <td className="muted">{new Date(v.createdAt).toLocaleDateString()}</td>
                <td className="muted">{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {videos.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">{t('videos.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
