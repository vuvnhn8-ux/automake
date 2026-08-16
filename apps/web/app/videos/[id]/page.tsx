'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Page {
  id: string;
  pageId: string;
  pageName: string;
  status: string;
}

interface VideoDetail {
  id: string;
  title: string;
  description?: string | null;
  caption?: string | null;
  hashtags: string[];
  status: string;
  template: string;
  resolution: string;
  fps: number;
  durationSeconds?: number | null;
  qualityScore?: number | null;
  url?: string | null;
  publishedAt?: string | null;
  content: {
    id: string;
    title?: string | null;
    topic?: { id: string; name: string } | null;
    scenes: {
      id: string;
      order: number;
      status: string;
      narration?: string | null;
      subtitleText?: string | null;
      durationSeconds: number;
      assets: { id: string; type: string; status: string; url?: string | null; provider: string }[];
    }[];
  };
  renderJobs: { id: string; status: string; createdAt: string; log?: string | null; error?: string | null }[];
  publishingJobs: { id: string; status: string; scheduledAt?: string | null; publishedAt?: string | null; facebookPostId?: string | null; errorMessage?: string | null; facebookPage?: { id: string; pageName: string } | null }[];
  project: { id: string; name: string; facebookPage?: { id: string; pageName: string } | null };
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api<{ video: VideoDetail }>(`/api/videos/${id}`)
      .then((d) => {
        setVideo(d.video);
        if (d.video.project.facebookPage && !selectedPages.length) {
          setSelectedPages((prev) => (prev.includes(d.video.project!.facebookPage!.id) ? prev : [...prev, d.video.project!.facebookPage!.id]));
        }
      })
      .catch((e) => setError(e.message));
  }, [id, selectedPages.length]);

  useEffect(() => {
    load();
    api<{ pages: Page[] }>('/api/facebook/pages')
      .then((d) => setPages(d.pages))
      .catch(() => {});
  }, [load]);

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('vdetail.requestFailed'));
    } finally {
      setBusy('');
    }
  };

  if (!video) {
    return (
      <Shell>
        <div className="muted">{t('vdetail.loading')}</div>
        {error && <div className="error">{error}</div>}
      </Shell>
    );
  }

  const badge = (s: string) =>
    s === 'READY' || s === 'PUBLISHED' || s === 'SUCCESS' ? 'ok' : s === 'FAILED' ? 'danger' : s.includes('ING') || s === 'PENDING' ? 'warn' : '';

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{video.title}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {video.project.name} · {video.template} · {video.resolution} @ {video.fps}fps
            {video.content.topic?.name ? ` · ${video.content.topic.name}` : ''}
          </div>
        </div>
        <span className={`badge ${badge(video.status)}`}>{video.status}</span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('vdetail.details')}</h3>
          <div className="muted" style={{ marginBottom: 8 }}>
            {t('vdetail.duration', { dur: video.durationSeconds ?? '—', quality: video.qualityScore ?? '—' })}
            {video.url && (
              <div>
                <a href={video.url} target="_blank" rel="noreferrer" className="mono" style={{ color: 'var(--accent)' }}>
                  {video.url}
                </a>
              </div>
            )}
          </div>

          <div className="wrap">
            <button className="btn small" disabled={busy === 'qa'} onClick={() => void run('qa', () => api(`/api/videos/${id}/qa`, { method: 'POST' }))}>
              {busy === 'qa' ? t('vdetail.qaBusy') : t('vdetail.runQa')}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="field">
              <label>{t('vdetail.publishTo')}</label>
              {pages.length === 0 && <div className="muted">{t('vdetail.noPages')}</div>}
              <div className="wrap">
                {pages.map((p) => (
                  <label key={p.id} className="row" style={{ gap: 6, marginRight: 14, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(p.id)}
                      onChange={(e) =>
                        setSelectedPages((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                        )
                      }
                    />
                    {p.pageName}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{t('vdetail.scheduleTime')}</label>
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </div>
            <button
              className="btn"
              disabled={selectedPages.length === 0 || busy === 'publish' || !(video.status === 'READY' || video.status === 'NEEDS_REVIEW')}
              onClick={() =>
                void run('publish', () =>
                  api(`/api/videos/${id}/publish`, {
                    method: 'POST',
                    body: { facebookPageIds: selectedPages, scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : undefined },
                  }),
                )
              }
            >
              {busy === 'publish'
                ? t('vdetail.publishing')
                : selectedPages.length === 1
                  ? t('vdetail.publishToN', { n: selectedPages.length })
                  : t('vdetail.publishToNs', { n: selectedPages.length })}
            </button>
          </div>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('vdetail.scenes', { n: video.content.scenes.length })}</h3>
          {video.content.scenes.map((s) => (
            <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="spread">
                <strong>#{s.order}</strong>
                <span className={`badge ${badge(s.status)}`}>{s.status}</span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{s.subtitleText ?? s.narration}</div>
              <div className="mono" style={{ fontSize: 11, marginTop: 2 }}>
                {s.assets.map((a) => `${a.type}=${a.status}`).join(' · ') || t('vdetail.noAssets')}
              </div>
            </div>
          ))}
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 16 }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('vdetail.renderJobs')}</h3>
          {video.renderJobs.map((j) => (
            <div key={j.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span className={`badge ${badge(j.status)}`}>{j.status}</span>
                <div className="mono" style={{ fontSize: 11, marginTop: 4, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.error ?? j.log ?? ''}
                </div>
              </div>
              <span className="muted mono">{new Date(j.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {video.renderJobs.length === 0 && <div className="muted">{t('vdetail.noRenderJobs')}</div>}
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('vdetail.publishingJobs')}</h3>
          {video.publishingJobs.map((j) => (
            <div key={j.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span className={`badge ${badge(j.status)}`}>{j.status}</span>{' '}
                <span className="muted" style={{ fontSize: 12 }}>{j.facebookPage?.pageName ?? ''}</span>
                <div className="mono" style={{ fontSize: 11, marginTop: 4 }}>
                  {j.facebookPostId ? t('vdetail.post', { id: j.facebookPostId }) : j.errorMessage ?? ''}
                </div>
              </div>
              <span className="muted mono">
                {j.scheduledAt
                  ? t('vdetail.scheduled', { date: new Date(j.scheduledAt).toLocaleString() })
                  : j.publishedAt
                    ? t('vdetail.published', { date: new Date(j.publishedAt).toLocaleString() })
                    : ''}
              </span>
            </div>
          ))}
          {video.publishingJobs.length === 0 && <div className="muted">{t('vdetail.notPublished')}</div>}
        </section>
      </div>
    </Shell>
  );
}
