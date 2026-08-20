'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export interface ChannelPublishing {
  id: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  facebookPostId: string | null;
  errorMessage: string | null;
}

export interface PublishableVideo {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  project: { id: string; name: string };
  channelPublishing: ChannelPublishing | null;
}

type Filter = 'NOT_PUBLISHED' | 'ALL';

function phaseOf(p: ChannelPublishing): string {
  switch (p.status) {
    case 'PENDING':
      return p.scheduledAt ? 'SCHEDULED' : 'QUEUED';
    case 'UPLOADING':
    case 'PROCESSING':
      return 'PUBLISHING';
    default:
      return p.status;
  }
}

export default function PublishVideoModal({
  channelId,
  channelName,
  onClose,
  onPublished,
}: {
  channelId: string;
  channelName: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<PublishableVideo[] | null>(null);
  const [filter, setFilter] = useState<Filter>('NOT_PUBLISHED');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setError('');
    api<{ videos: PublishableVideo[] }>(`/api/channels/${channelId}/publishable-videos`)
      .then((d) => setVideos(d.videos))
      .catch((e) => setError(e.message));
  }, [channelId]);

  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!videos) return null;
    if (filter === 'ALL') return videos;
    return videos.filter((v) => !v.channelPublishing || v.channelPublishing.status === 'FAILED' || v.channelPublishing.status === 'CANCELLED');
  }, [videos, filter]);

  const publish = async (v: PublishableVideo) => {
    const isRepublish = v.channelPublishing?.status === 'PUBLISHED';
    if (isRepublish && !window.confirm(t('chpub.confirmRepublish'))) return;
    setBusyId(v.id);
    setError('');
    setNotice('');
    try {
      await api(`/api/channels/${channelId}/publish`, {
        method: 'POST',
        body: { videoId: v.id, confirm: isRepublish },
      });
      setNotice(t('chpub.enqueued'));
      onPublished();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chpub.publishError'));
    } finally {
      setBusyId('');
    }
  };

  const statusBadge = (p: ChannelPublishing | null) => {
    if (!p) return <span className="badge">{t('chpub.notPublishedBadge')}</span>;
    const phase = phaseOf(p);
    const cls =
      phase === 'PUBLISHED' ? 'badge ok' : phase === 'FAILED' || phase === 'CANCELLED' ? 'badge danger' : phase === 'PUBLISHING' ? 'badge' : 'badge warn';
    const label = t(`chpub.badge.${phase.toLowerCase()}` as never);
    return (
      <span>
        <span className={cls}>{label}</span>
        {p.publishedAt && (
          <div className="muted" style={{ fontSize: 12 }}>
            {t('chpub.publishedAt', { date: new Date(p.publishedAt).toLocaleString() })}
          </div>
        )}
        {p.errorMessage && phase === 'FAILED' && (
          <div className="muted" style={{ fontSize: 11, maxWidth: 200 }}>
            {p.errorMessage}
          </div>
        )}
      </span>
    );
  };

  const canPublish = (v: PublishableVideo) => {
    if (v.status !== 'READY' && v.status !== 'NEEDS_REVIEW') return false;
    const p = v.channelPublishing;
    if (p && (p.status === 'PENDING' || p.status === 'UPLOADING' || p.status === 'PROCESSING')) return false;
    return true;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 860, maxHeight: '85vh', overflow: 'auto' }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{t('chpub.title', { channel: channelName })}</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{t('chpub.subtitle')}</div>
          </div>
          <button className="btn small secondary" onClick={onClose}>{t('chpub.close')}</button>
        </div>

        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        {notice && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{notice}</div>}

        <div className="wrap" style={{ gap: 6, marginBottom: 12 }}>
          <button className={`btn small ${filter === 'NOT_PUBLISHED' ? '' : 'secondary'}`} onClick={() => setFilter('NOT_PUBLISHED')}>
            {t('chpub.filterNotPublished')}
          </button>
          <button className={`btn small ${filter === 'ALL' ? '' : 'secondary'}`} onClick={() => setFilter('ALL')}>
            {t('chpub.filterAll')}
          </button>
        </div>

        {visible === null ? (
          <p className="muted">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('chpub.noVideos')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('chpub.video')}</th>
                <th>{t('chpub.project')}</th>
                <th>{t('videos.status')}</th>
                <th>{t('chpub.channelStatus')}</th>
                <th>{t('chpub.action')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => {
                const ready = canPublish(v);
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{new Date(v.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="muted">{v.project.name}</td>
                    <td>
                      <span className={`badge ${v.status === 'READY' ? 'ok' : v.status === 'NEEDS_REVIEW' ? 'warn' : 'danger'}`}>{v.status}</span>
                    </td>
                    <td>{statusBadge(v.channelPublishing)}</td>
                    <td>
                      {ready ? (
                        <button className="btn small" disabled={busyId === v.id} onClick={() => void publish(v)}>
                          {busyId === v.id
                            ? t('chpub.publishing')
                            : v.channelPublishing?.status === 'PUBLISHED'
                              ? t('chpub.republish')
                              : t('chpub.publish')}
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>{t('chpub.notReady')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
