'use client';

import { useI18n } from '@/lib/i18n';

const LANGS = ['vi', 'en'] as const;

export default function LangSwitch() {
  const { lang, setLang } = useI18n();

  return (
    <div
      className="row"
      style={{ gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          className="btn small link"
          type="button"
          onClick={() => setLang(l)}
          style={{
            borderRadius: 0,
            padding: '5px 10px',
            background: lang === l ? 'var(--panel-2)' : 'transparent',
            color: lang === l ? 'var(--text)' : 'var(--muted)',
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
