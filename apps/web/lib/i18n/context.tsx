'use client';

import * as React from 'react';
import { dictionary, type TranslateFn, type TranslationKey } from './dictionary';

export type Lang = 'en' | 'he';
export type Dir = 'ltr' | 'rtl';

interface I18nContextValue {
  lang: Lang;
  dir: Dir;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

/** localStorage key holding the chosen language (shared with the pre-paint script in layout.tsx). */
const STORAGE_KEY = 'lang';

function dirFor(lang: Lang): Dir {
  return lang === 'he' ? 'rtl' : 'ltr';
}

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'he';
}

/** Replace `{name}` placeholders in a string with values from `vars`. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

function applyToDocument(lang: Lang): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = dirFor(lang);
}

/**
 * Provides the current language/direction and a `t()` translator to the tree.
 *
 * The initial render is always the default `en`/`ltr` so it matches the
 * server-rendered HTML (no hydration mismatch). The pre-paint script in the
 * root layout has already set `<html dir>` from `localStorage`, so the visual
 * direction is correct before paint; this effect then reconciles the React
 * state (and thus the rendered strings) with the stored preference.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>('en');

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — fall back to the default */
    }
    const initial: Lang = isLang(stored) ? stored : 'en';
    applyToDocument(initial);
    if (initial !== 'en') setLangState(initial);
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    applyToDocument(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
  }, []);

  const t = React.useCallback<TranslateFn>(
    (key: TranslationKey, vars) => {
      const table = dictionary[lang] ?? dictionary.en;
      const value = table[key] ?? dictionary.en[key] ?? key;
      return interpolate(value, vars);
    },
    [lang],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({ lang, dir: dirFor(lang), setLang, t }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current language, direction, `setLang`, and the `t()` translator. */
export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within a <LanguageProvider>');
  }
  return ctx;
}
