import * as React from 'react'

import { applyLocale, readStoredLocale, writeStoredLocale, type Locale } from '@/lib/locale'
import {
  resolveMessage,
  resolvePlural,
  type PluralGroupPath,
  type StringPath,
} from '@/i18n/format'
import type { Messages } from '@/i18n/messages/types'

type Params = Record<string, string | number>

type LocaleContextValue = {
  /** The chosen UI language. */
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Resolves a plain string message, with `{name}` interpolation. */
  t: (key: StringPath<Messages>, params?: Params) => string
  /** Resolves a plural-form message for `count`, picking the CLDR category via
   *  `Intl.PluralRules(locale)` — `{count}` is always available to the template even when
   *  `params` doesn't repeat it. */
  tn: (key: PluralGroupPath<Messages>, count: number, params?: Params) => string
}

// Trees rendered without a provider (isolated component tests, embeds) read English rather than
// crashing; the app always mounts <LocaleProvider> at the root (app.tsx).
const FALLBACK_CONTEXT: LocaleContextValue = {
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => resolveMessage('en', key, params),
  tn: (key, count, params) => resolvePlural('en', key, count, params),
}

const LocaleContext = React.createContext<LocaleContextValue>(FALLBACK_CONTEXT)

/**
 * Owns the UI language preference — the same shape as `ThemeProvider`: seeds from
 * `localStorage` (or, on first run, `navigator.language`; see `lib/locale.ts`), keeps
 * `<html lang>` in sync, and hands every reader a stable `t()`/`tn()` pair.
 *
 * Per-browser, like the theme: no server round trip, and the pre-paint script in
 * `packages/web/index.html` mirrors the same detection rule so there is no flash of the wrong
 * language before the bundle mounts (there is no per-language visual difference to flash, but
 * `<html lang>` itself should still be right from the first paint for assistive tech).
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(readStoredLocale)

  // Layout effect, not effect: `lang` should land before the browser paints the mounted tree,
  // matching the theme provider's own rationale for `applyResolvedTheme`.
  React.useLayoutEffect(() => {
    applyLocale(document.documentElement, locale)
  }, [locale])

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    writeStoredLocale(next)
  }, [])

  const t = React.useCallback(
    (key: StringPath<Messages>, params?: Params) => resolveMessage(locale, key, params),
    [locale],
  )
  const tn = React.useCallback(
    (key: PluralGroupPath<Messages>, count: number, params?: Params) => resolvePlural(locale, key, count, params),
    [locale],
  )

  const value = React.useMemo<LocaleContextValue>(() => ({ locale, setLocale, t, tn }), [locale, setLocale, t, tn])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  return React.useContext(LocaleContext)
}
