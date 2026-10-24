import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en } from './en'
import { hi } from './hi'

/**
 * Translation structure: one flat dictionary per language, keyed by dotted ids ("home.hero.title").
 * English is the source of truth and the fallback. To add a language (say Marathi):
 *   1. create src/i18n/mr.ts exporting `Partial<typeof en>`,
 *   2. register it in DICTIONARIES and LANGUAGES below.
 */
export type Dictionary = Partial<Record<keyof typeof en, string>>

export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
] as const
export type LangCode = (typeof LANGUAGES)[number]['code']

const DICTIONARIES: Record<LangCode, Dictionary> = { en, hi }
const STORAGE_KEY = 'lc.lang'

function readStoredLang(): LangCode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'hi') return v
  } catch { /* storage unavailable */ }
  return 'en'
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string

interface I18nValue {
  lang: LangCode
  locale: string
  setLang: (l: LangCode) => void
  t: TFn
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(readStoredLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: LangCode) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  const t = useCallback<TFn>(
    (key, vars) => {
      const raw = (DICTIONARIES[lang] as Record<string, string | undefined>)[key] ?? (en as Record<string, string>)[key]
      if (raw === undefined) return key
      return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : raw
    },
    [lang],
  )

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t, locale: LANGUAGES.find((l) => l.code === lang)!.locale }),
    [lang, setLang, t],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>')
  return v
}

export function useT(): TFn {
  return useI18n().t
}
