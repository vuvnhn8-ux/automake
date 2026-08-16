import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { LanguageProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'AI Video Factory',
  description: 'Automated AI video generation and Facebook publishing platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
