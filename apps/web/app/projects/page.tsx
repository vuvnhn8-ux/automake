'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  language: string;
  publishingMode: string;
  defaultTemplate: string;
  defaultDurationSeconds: number;
  createdAt: string;
  _count: { topics: number; videos: number; contents: number; schedules: number };
}

export default function ProjectsPage() {
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
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Projects</h2>
      </div>

      <form onSubmit={(e) => void create(e)} className="card" style={{ marginBottom: 24 }}>
        <div className="row">
          <input
            placeholder="Project name"
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
          <button className="btn" type="submit" disabled={creating || !name.trim()}>
            Create
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card" style={{ display: 'block' }}>
            <div className="spread">
              <div>
                <strong>{p.name}</strong>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {p.language} · {p.publishingMode} · {p.defaultDurationSeconds}s
                </div>
              </div>
              <div className="wrap">
                <span className="badge accent">{p._count.topics} topics</span>
                <span className="badge">{p._count.contents} contents</span>
                <span className="badge">{p._count.videos} videos</span>
                <span className="badge">{p._count.schedules} schedules</span>
              </div>
            </div>
          </Link>
        ))}
        {projects.length === 0 && <div className="card muted">No projects yet. Create one above.</div>}
      </div>
    </Shell>
  );
}
