import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { SupportedLanguage } from '../../shared/languages.ts';
import bnDict from './bn.json';
import enDict from './en.json';
import guDict from './gu.json';
import hiDict from './hi.json';
import knDict from './kn.json';
import mlDict from './ml.json';
import mrDict from './mr.json';
import paDict from './pa.json';
import taDict from './ta.json';
import teDict from './te.json';

export type { SupportedLanguage };

export const DICTIONARIES: Record<SupportedLanguage, typeof enDict> = {
  en: enDict,
  hi: hiDict,
  mr: mrDict,
  pa: paDict,
  bn: bnDict,
  ta: taDict,
  te: teDict,
  gu: guDict,
  kn: knDict,
  ml: mlDict,
};

export function flattenDictionaryKeys(
  obj: Record<string, unknown>,
  prefix = ''
): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenDictionaryKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

function resolvePath(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}

export function translate(
  lang: SupportedLanguage,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = DICTIONARIES[lang] ?? DICTIONARIES.en;
  const primary = resolvePath(dict as unknown as Record<string, unknown>, key);
  const fallback =
    primary ?? resolvePath(DICTIONARIES.en as unknown as Record<string, unknown>, key) ?? key;

  if (!vars) return fallback;
  return fallback.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
    token in vars ? String(vars[token]) : `{{${token}}}`
  );
}

interface I18nContextValue {
  language: SupportedLanguage;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (key, vars) => translate('en', key, vars),
});

export function I18nProvider({
  language,
  children,
}: {
  language: SupportedLanguage;
  children: ReactNode;
}) {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
