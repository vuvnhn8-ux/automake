'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();

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
      setNotice(t('adetail.updated'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adetail.updateFailed'));
    }
  };

  const disconnect = async () => {
    setError('');
    setNotice('');
    try {
      await api(`/api/accounts/${id}`, { method: 'PATCH', body: { status: 'DISCONNECTED' } });
      setNotice(t('adetail.disconnected'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adetail.failed'));
    }
  };

  if (!account) {
    return (
      <Shell>
        <div className="hero">{t('adetail.loading')}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <div>
          <button className="btn secondary small" onClick={() => router.push('/accounts')}>
            {t('adetail.back')}
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
        <h3 style={{ marginTop: 0 }}>{t('adetail.credentials')}</h3>
        <div className="mono" style={{ marginBottom: 12 }}>{account.credentialsMask}</div>
        <div className="row">
          <input placeholder={t('adetail.namePlaceholder')} value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ flex: 1 }} />
          <input type="password" placeholder={t('adetail.tokenPlaceholder')} value={credentials} onChange={(e) => setCredentials(e.target.value)} style={{ flex: 2 }} />
          <button className="btn" type="submit">
            {t('adetail.save')}
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn secondary small" type="button" onClick={() => void disconnect()}>
            {t('adetail.markDisconnected')}
          </button>
        </div>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('adetail.linkedChannels')}</h3>
        <table>
          <thead>
            <tr>
              <th>{t('adetail.name')}</th>
              <th>{t('adetail.platform')}</th>
              <th>{t('adetail.facebookPage')}</th>
              <th>{t('adetail.status')}</th>
            </tr>
          </thead>
          <tbody>
            {account.channels.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.platform}</td>
                <td className="muted">{c.facebookPage?.pageName ?? '—'}</td>
                <td>
                  <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>{c.isActive ? t('channels.statusActive') : t('channels.statusDisabled')}</span>
                </td>
              </tr>
            ))}
            {account.channels.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">{t('adetail.noLinked')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
