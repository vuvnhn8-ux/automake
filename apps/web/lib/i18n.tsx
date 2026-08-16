'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { vi, type Dict, type DictKey } from './i18n/vi';
import { en } from './i18n/en';

export type Lang = 'vi' | 'en';

const DICTS: Record<Lang, Dict> = { vi, en };
const LANG_KEY = 'avf_lang';

export interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nState>({
  lang: 'vi',
  setLang: () => {},
  t: () => '',
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('vi');

  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'vi' || stored === 'en') setLangState(stored);
    else setLangState('vi');
  }, []);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => {
      let s: string = DICTS[lang][key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  return useContext(I18nContext);
}
