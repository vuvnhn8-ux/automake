'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Project {
  id: string;
  name: string;
}

interface Account {
  id: string;
  projectId: string;
  project: { id: string; name: string };
  platform: string;
  accountName: string;
  externalAccountId: string | null;
  status: string;
  hasCredentials: boolean;
  credentialsMask: string;
  _count: { channels: number };
}

export default function AccountsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [projectId, setProjectId] = useState('');
  const [platform, setPlatform] = useState('FACEBOOK');
  const [accountName, setAccountName] = useState('');
  const [externalAccountId, setExternalAccountId] = useState('');
  const [credentials, setCredentials] = useState('');
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
    api<{ accounts: Account[] }>('/api/accounts')
      .then((d) => setAccounts(d.accounts))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api(`/api/projects/${projectId}/accounts`, {
        method: 'POST',
        body: {
          platform,
          accountName,
          externalAccountId: externalAccountId || undefined,
          credentials,
        },
      });
      setAccountName('');
      setExternalAccountId('');
      setCredentials('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/accounts/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const statusBadge = (s: string) => (s === 'CONNECTED' ? 'ok' : s === 'EXPIRED' ? 'warn' : s === 'REVOKED' ? 'danger' : '');

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Publishing Accounts</h2>
        <span className="muted">Credentials are AES-256-GCM encrypted and never returned</span>
      </div>

      <form onSubmit={(e) => void create(e)} className="card" style={{ marginBottom: 24 }}>
        <div className="row">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: 200 }}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ width: 160 }}>
            {['FACEBOOK', 'TIKTOK', 'YOUTUBE', 'INSTAGRAM'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input placeholder="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input placeholder="External account id (optional)" value={externalAccountId} onChange={(e) => setExternalAccountId(e.target.value)} style={{ flex: 1 }} />
          <input
            type="password"
            placeholder="Access token / credentials"
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            style={{ flex: 2 }}
          />
          <button className="btn" type="submit" disabled={creating || !accountName.trim() || !credentials.trim() || !projectId}>
            Add
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="grid">
        {accounts.map((a) => (
          <div key={a.id} className="card">
            <div className="spread">
              <div>
                <Link href={`/accounts/${a.id}`}>
                  <strong>{a.accountName}</strong>
                </Link>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {a.platform} · {a.project.name} · {a.externalAccountId ?? 'no external id'}
                </div>
                <div className="mono" style={{ marginTop: 4 }}>{a.credentialsMask}</div>
              </div>
              <div className="wrap">
                <span className={`badge ${statusBadge(a.status)}`}>{a.status}</span>
                <span className="badge accent">{a._count.channels} channels</span>
                <button className="btn danger small" onClick={() => void remove(a.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="card muted">No publishing accounts yet. Add one above to enable non-Facebook destinations.</div>
        )}
      </div>
    </Shell>
  );
}
