'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Page {
  id: string;
  pageId: string;
  pageName: string;
  status: string;
}

interface Channel {
  id: string;
  name: string;
  platform: string;
  description?: string | null;
  dailyVideoTarget: number;
  autoGenerationEnabled: boolean;
  isActive: boolean;
  facebookPage?: { id: string; pageId: string; pageName: string } | null;
  contentProfile?: { id: string; language: string; tone: string } | null;
  _count: { series: number; knowledge: number; contents: number };
}

const PLATFORMS = ['FACEBOOK', 'YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'OTHER'];

export default function ProjectChannelsPage() {
  const { id } = useParams<{ id: string }>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('FACEBOOK');
  const [dailyVideoTarget, setDailyVideoTarget] = useState(1);
  const [facebookPageId, setFacebookPageId] = useState('');

  const load = () => {
    if (!id) return;
    api<{ channels: Channel[] }>(`/api/projects/${id}/channels`)
      .then((d) => setChannels(d.channels))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    api<{ pages: Page[] }>('/api/facebook/pages').then((d) => setPages(d.pages)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api(`/api/projects/${id}/channels`, {
        method: 'POST',
        body: { name, platform, dailyVideoTarget, facebookPageId: facebookPageId || undefined },
      });
      setName('');
      setPlatform('FACEBOOK');
      setDailyVideoTarget(1);
      setFacebookPageId('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    }
  };

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            <Link href={`/projects/${id}`}>← Project</Link>
          </div>
          <h2 style={{ margin: 0 }}>Channels</h2>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={(e) => void create(e)} className="card" style={{ marginBottom: 24 }}>
        <div className="row">
          <input placeholder="Channel name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={facebookPageId} onChange={(e) => setFacebookPageId(e.target.value)}>
            <option value="">— Facebook page —</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>{p.pageName}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={100}
            value={dailyVideoTarget}
            onChange={(e) => setDailyVideoTarget(Number(e.target.value))}
            title="Daily video target"
            style={{ width: 80 }}
          />
          <button className="btn" type="submit" disabled={!name.trim()}>Create</button>
        </div>
      </form>

      <div className="grid">
        {channels.map((c) => (
          <Link key={c.id} href={`/projects/${id}/channels/${c.id}`} className="card" style={{ display: 'block' }}>
            <div className="spread">
              <div>
                <strong>{c.name}</strong>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {c.platform} · {c.dailyVideoTarget}/day
                  {c.facebookPage ? ` · → ${c.facebookPage.pageName}` : ''}
                  {c.contentProfile ? ` · ${c.contentProfile.language} / ${c.contentProfile.tone}` : ' · no profile yet'}
                </div>
              </div>
              <div className="wrap">
                <span className="badge accent">{c._count.series} series</span>
                <span className="badge">{c._count.knowledge} KB</span>
                <span className="badge">{c._count.contents} contents</span>
                <span className={`badge ${c.isActive ? 'ok' : ''}`}>{c.isActive ? 'active' : 'off'}</span>
              </div>
            </div>
          </Link>
        ))}
        {channels.length === 0 && <div className="card muted">No channels yet. Create one above.</div>}
      </div>
    </Shell>
  );
}
