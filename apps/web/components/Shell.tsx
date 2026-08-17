'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { UnsavedChangesProvider } from '@/lib/UnsavedChangesContext';
import Nav from './Nav';

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="hero">{t('common.loading')}</div>;
  }

  return (
    <UnsavedChangesProvider>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <Nav />
        <main style={{ padding: '24px', maxWidth: 1080, margin: '0 auto' }}>{children}</main>
      </div>
    </UnsavedChangesProvider>
  );
}
