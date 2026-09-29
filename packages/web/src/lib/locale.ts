/* UI language preference: the pure half, mirroring `lib/theme.ts` exactly — same storage
 * shape, same "coerce anything into a valid value" discipline, same reason for existing:
 * `resolveLocale()`/`applyLocale()` can be table-tested, and the pre-paint script in
 * `packages/web/index.html` mirrors the detection rule in a few lines of vanilla JS so
 * `<html lang>` is right before the bundle exists.
 *
 * IMPORTANT: `packages/web/index.html`'s inline script duplicates `detectBrowserLocale()` +
 * `applyLocale()` on purpose. Change one, change the other.
 *
 * Per-browser by design, like the theme: no server round trip, nothing to fetch on boot, and a
 * cezar opened from two browsers on the same machine may reasonably read in two languages.
 */

export const LOCALE_STORAGE_KEY = 'cez-locale'

export type Locale = 'en' | 'pl'

/** The ultimate fallback when neither storage nor `navigator.language` says anything usable
 *  (SSR, a stripped test environment). Real first-run behavior is `detectBrowserLocale()`, not
 *  this — see `readStoredLocale()`. */
export const DEFAULT_LOCALE: Locale = 'en'

/** Coerce anything (missing key, a future value, garbage) into a Locale, or null when it simply
 *  isn't one — callers that want a fallback other than `DEFAULT_LOCALE` (the browser's own
 *  language, on first run) need to tell "absent" apart from "invalid". */
export function normalizeLocale(raw: unknown): Locale | null {
  return raw === 'en' || raw === 'pl' ? raw : null
}

/** The requirement's whole detection rule: `navigator.language` starting with `pl` (`pl`,
 *  `pl-PL`, …) is Polish; anything else — including absent — is English. Takes the language
 *  string rather than reading `navigator` itself so the rule stays table-testable. */
export function detectBrowserLocale(language: string | null | undefined): Locale {
  return typeof language === 'string' && language.toLowerCase().startsWith('pl') ? 'pl' : 'en'
}

/** The stored preference, or the browser's own language when nothing has been chosen yet — a
 *  never-chosen preference is not the same question as a garbage one, so this reaches past
 *  `DEFAULT_LOCALE` to `detectBrowserLocale()` rather than collapsing both cases onto English. */
export function readStoredLocale(): Locale {
  try {
    const stored = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
    if (stored) return stored
  } catch {
    // Private mode / storage disabled — fall through to browser detection below.
  }
  return detectBrowserLocale(typeof navigator === 'undefined' ? null : navigator.language)
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Private mode / storage disabled — the locale still applies for this page.
  }
}

/** Stamp the root element's `lang` attribute — the one DOM effect a locale choice has beyond
 *  which dictionary `t()` reads from. Screen readers and browser features (spell-check, translate
 *  offers, `:lang()` CSS) all key off this. */
export function applyLocale(root: HTMLElement, locale: Locale): void {
  root.lang = locale
}
