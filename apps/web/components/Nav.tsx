'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/videos', label: 'Videos' },
  { href: '/channels', label: 'Channels' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/facebook', label: 'Facebook' },
  { href: '/workers', label: 'Workers' },
  { href: '/providers', label: 'Providers' },
  { href: '/settings', label: 'Settings' },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Link href="/dashboard" style={{ fontWeight: 700, fontSize: 16 }}>
          AI Video Factory
        </Link>
        <nav style={{ display: 'flex', gap: 6 }}>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 14,
                background: pathname.startsWith(l.href) ? 'var(--panel-2)' : 'transparent',
                color: pathname.startsWith(l.href) ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {user?.email}
        </span>
        <button className="btn secondary small" onClick={() => void logout()}>
          Logout
        </button>
      </div>
    </header>
  );
}
