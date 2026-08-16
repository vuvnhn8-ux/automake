'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  language: string;
  publishingMode: string;
  defaultTemplate: string;
  defaultDurationSeconds: number;
  status: string;
  dailyVideoTarget: number;
  timezone: string;
  nextRunAt: string | null;
  createdAt: string;
  _count: { topics: number; videos: number; contents: number; schedules: number; channelAssignments: number };
}

export default function ProjectsPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = () => {
    api<{ projects: Project[] }>('/api/projects')
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api('/api/projects', { method: 'POST', body: { name, description: description || undefined } });
      setName('');
      setDescription('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('projects.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>{t('projects.title')}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {t('projects.subtitle')}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void create(e)} className="card" style={{ marginBottom: 24 }}>
        <div className="row">
          <input
            placeholder={t('projects.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            placeholder={t('projects.descPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ flex: 2 }}
          />
          <button className="btn" type="submit" disabled={creating || !name.trim()}>
            {t('projects.create')}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card" style={{ display: 'block' }}>
            <div className="spread" style={{ marginBottom: 8 }}>
              <strong>{p.name}</strong>
              <span className={`badge ${p.status === 'ACTIVE' ? 'ok' : 'warn'}`}>
                {p.status === 'ACTIVE' ? t('projects.active') : t('projects.paused')}
              </span>
            </div>
            {p.description && <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{p.description}</div>}
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              {t('projects.meta', { language: p.language, mode: p.publishingMode })}
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="badge accent">{t('projects.perDay', { n: p.dailyVideoTarget })}</span>
              <span className="badge">{t('projects.channels', { n: p._count.channelAssignments })}</span>
              <span className="badge">{t('projects.topics', { n: p._count.topics })}</span>
              <span className="badge">{t('projects.videos', { n: p._count.videos })}</span>
              <span className="badge">{t('projects.schedules', { n: p._count.schedules })}</span>
            </div>
            {p.nextRunAt && (
              <div className="muted" style={{ fontSize: 12 }}>
                {t('projects.nextRun', { date: new Date(p.nextRunAt).toLocaleString() })}
              </div>
            )}
          </Link>
        ))}
        {projects.length === 0 && <div className="card muted">{t('projects.empty')}</div>}
      </div>
    </Shell>
  );
}
