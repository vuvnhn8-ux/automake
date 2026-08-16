'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  if (loading) return <div className="hero">{t('common.loading')}</div>;
  if (user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hero">
      <h1>{t('login.title')}</h1>
      <p className="muted">{t('login.subtitle')}</p>
      <div style={{ maxWidth: 380, margin: '32px auto', textAlign: 'left' }}>
        <form onSubmit={(e) => void submit(e)} className="card grid">
          <div className="field">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
