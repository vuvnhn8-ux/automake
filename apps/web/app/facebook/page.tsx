'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Page {
  id: string;
  pageId: string;
  pageName: string;
  status: string;
  tokenExpiresAt?: string | null;
  installedAt: string;
}

export default function FacebookPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [authUrl, setAuthUrl] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api<{ pages: Page[] }>('/api/facebook/pages')
      .then((d) => setPages(d.pages))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const connect = async () => {
    setError('');
    try {
      const d = await api<{ url: string }>('/api/facebook/auth-url');
      setAuthUrl(d.url);
      window.open(d.url, '_blank', 'width=700,height=640');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Facebook login');
    }
  };

  const remove = async (pageId: string) => {
    await api(`/api/facebook/pages/${pageId}`, { method: 'DELETE' });
    load();
  };

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Facebook pages</h2>
        <button className="btn" onClick={() => void connect()}>
          Connect a page
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {authUrl && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="muted">If the popup was blocked, open this link manually:</div>
          <a href={authUrl} target="_blank" rel="noreferrer" className="mono" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>
            {authUrl}
          </a>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Status</th>
              <th>Token expires</th>
              <th>Connected</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.pageName}
                  <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{p.pageId}</div>
                </td>
                <td>
                  <span className={`badge ${p.status === 'CONNECTED' ? 'ok' : 'warn'}`}>{p.status}</span>
                </td>
                <td className="muted">{p.tokenExpiresAt ? new Date(p.tokenExpiresAt).toLocaleString() : 'long-lived'}</td>
                <td className="muted">{new Date(p.installedAt).toLocaleDateString()}</td>
                <td>
                  <button className="btn small secondary" onClick={() => void remove(p.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {pages.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No pages connected. Click “Connect a page”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
