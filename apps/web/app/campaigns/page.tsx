'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Project {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dailyVideoTarget: number;
  timezone: string;
  _count: { assignments: number; series: number; contents: number };
}

export default function CampaignsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ projects: Project[] }>('/api/projects')
      .then((d) => {
        setProjects(d.projects);
        if (d.projects.length > 0) setProjectId((prev) => prev || d.projects[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = () => {
    if (!projectId) return;
    api<{ campaigns: Campaign[] }>(`/api/projects/${projectId}/campaigns`)
      .then((d) => setCampaigns(d.campaigns))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [projectId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api(`/api/projects/${projectId}/campaigns`, {
        method: 'POST',
        body: { name, description: description || undefined },
      });
      setName('');
      setDescription('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (status: string) =>
    status === 'ACTIVE' ? 'ok' : status === 'PAUSED' ? 'warn' : status === 'ARCHIVED' ? 'danger' : '';

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Content Campaigns</h2>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: 260 }}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={(e) => void create(e)} className="card" style={{ marginBottom: 24 }}>
        <div className="row">
          <input
            placeholder="Campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ flex: 2 }}
          />
          <button className="btn" type="submit" disabled={creating || !name.trim() || !projectId}>
            Create
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="grid">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/campaigns/${c.id}`} className="card" style={{ display: 'block' }}>
            <div className="spread">
              <div>
                <strong>{c.name}</strong>
                {c.description && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {c.description}
                  </div>
                )}
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {c.dailyVideoTarget}/day · {c.timezone}
                </div>
              </div>
              <div className="wrap">
                <span className={`badge ${statusBadge(c.status)}`}>{c.status}</span>
                <span className="badge accent">{c._count.assignments} channels</span>
                <span className="badge">{c._count.series} series</span>
                <span className="badge">{c._count.contents} contents</span>
              </div>
            </div>
          </Link>
        ))}
        {campaigns.length === 0 && (
          <div className="card muted">No campaigns yet in this project. Create one above.</div>
        )}
      </div>
    </Shell>
  );
}
