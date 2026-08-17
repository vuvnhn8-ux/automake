'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useUnsavedChangesRegistry } from '@/lib/UnsavedChangesContext';
import LangSwitch from './LangSwitch';

const PRIMARY: { href: string; key: 'dashboard' | 'projects' | 'channels' | 'workers' | 'providers' | 'settings' }[] = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/projects', key: 'projects' },
  { href: '/channels', key: 'channels' },
  { href: '/workers', key: 'workers' },
  { href: '/providers', key: 'providers' },
  { href: '/settings', key: 'settings' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Nav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const unsaved = useUnsavedChangesRegistry();

  const linkStyle = (href: string) => ({
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 14,
    background: isActive(pathname, href) ? 'var(--panel-2)' : 'transparent',
    color: isActive(pathname, href) ? 'var(--text)' : 'var(--muted)',
  });

  const go = (href: string, e: React.MouseEvent) => {
    if (pathname === href) return;
    if (unsaved && !unsaved.allowNavigation()) {
      e.preventDefault();
    }
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Link
          href="/dashboard"
          style={{ fontWeight: 700, fontSize: 16 }}
          onClick={(e) => go('/dashboard', e)}
        >
          {t('nav.brand')}
        </Link>
        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} style={linkStyle(l.href)} onClick={(e) => go(l.href, e)}>
              {t(`nav.${l.key}`)}
            </Link>
          ))}
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <LangSwitch />
        <span className="muted" style={{ fontSize: 13 }}>
          {user?.email}
        </span>
        <button
          className="btn secondary small"
          onClick={() => {
            if (unsaved && !unsaved.allowNavigation()) return;
            void logout();
          }}
        >
          {t('nav.logout')}
        </button>
      </div>
    </header>
  );
}
