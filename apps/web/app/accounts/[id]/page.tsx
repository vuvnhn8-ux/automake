'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Channel {
  id: string;
  name: string;
  platform: string;
  isActive: boolean;
  facebookPage: { id: string; pageName: string } | null;
}

interface AccountDetail {
  id: string;
  platform: string;
  accountName: string;
  externalAccountId: string | null;
  status: string;
  hasCredentials: boolean;
  credentialsMask: string;
  metadata: Record<string, unknown> | null;
  channels: Channel[];
}

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accountName, setAccountName] = useState('');
  const [credentials, setCredentials] = useState('');

  const load = useCallback(() => {
    api<{ account: AccountDetail }>(`/api/accounts/${id}`)
      .then((d) => {
        setAccount(d.account);
        setAccountName(d.account.accountName);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api(`/api/accounts/${id}`, {
        method: 'PATCH',
        body: {
          accountName: accountName || undefined,
          ...(credentials ? { credentials } : {}),
        },
      });
      setCredentials('');
      setNotice('Account updated');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const disconnect = async () => {
    setError('');
    setNotice('');
    try {
      await api(`/api/accounts/${id}`, { method: 'PATCH', body: { status: 'DISCONNECTED' } });
      setNotice('Account marked DISCONNECTED');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  if (!account) {
    return (
      <Shell>
        <div className="hero">Loading…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <div>
          <button className="btn secondary small" onClick={() => router.push('/accounts')}>
            ← Accounts
          </button>
          <h2 style={{ margin: '10px 0 0' }}>{account.accountName}</h2>
          <div className="wrap" style={{ marginTop: 8 }}>
            <span className={`badge ${account.status === 'CONNECTED' ? 'ok' : 'warn'}`}>{account.status}</span>
            <span className="badge accent">{account.platform}</span>
            {account.externalAccountId && <span className="mono">{account.externalAccountId}</span>}
          </div>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="muted" style={{ marginBottom: 12, color: 'var(--ok)' }}>{notice}</div>}

      <form onSubmit={(e) => void save(e)} className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Credentials</h3>
        <div className="mono" style={{ marginBottom: 12 }}>{account.credentialsMask}</div>
        <div className="row">
          <input placeholder="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ flex: 1 }} />
          <input type="password" placeholder="New access token (leave empty to keep)" value={credentials} onChange={(e) => setCredentials(e.target.value)} style={{ flex: 2 }} />
          <button className="btn" type="submit">
            Save
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn secondary small" type="button" onClick={() => void disconnect()}>
            Mark disconnected
          </button>
        </div>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Linked channels</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Platform</th>
              <th>Facebook page</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {account.channels.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.platform}</td>
                <td className="muted">{c.facebookPage?.pageName ?? '—'}</td>
                <td>
                  <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>{c.isActive ? 'ACTIVE' : 'DISABLED'}</span>
                </td>
              </tr>
            ))}
            {account.channels.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No channels linked to this account.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
