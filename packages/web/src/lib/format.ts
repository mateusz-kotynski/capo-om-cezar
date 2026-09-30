import { formatLocale } from '@/lib/locale'

/**
 * Compact age — `4s` / `26m` / `2h` / `3d`, the sidebar's and table's age column.
 *
 * One unit, no rounding up, no "ago": at 7px-of-dot density the unit *is* the information. Ports
 * `shortAgo()` from the legacy UI (web/app.js) unchanged, so both cockpits read the same.
 *
 * `now` is a parameter rather than a `Date.now()` call so the tests are not racing the clock.
 * Returns '' for a missing or unparseable timestamp — an empty slot is honest; `NaNm` is not.
 */
export function shortAge(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const units = formatLocale() === 'pl' ? AGE_UNITS_PL : AGE_UNITS_EN
  // Clamp: a clock skew between the server's timestamp and the browser must not print `-3s`.
  const seconds = Math.max(0, (now - then) / 1000)
  if (seconds < 60) return `${Math.floor(seconds)}${units.s}`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${units.m}`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}${units.h}`
  return `${Math.floor(seconds / 86400)}${units.d}`
}

/** The compact units, per UI language (read through `formatLocale()`, like every other
 *  module-level formatter). Polish uses the standard abbreviations: s, min, godz., d. */
const AGE_UNITS_EN = { s: 's', m: 'm', h: 'h', d: 'd' } as const
const AGE_UNITS_PL = { s: ' s', m: ' min', h: ' godz.', d: ' d' } as const

/**
 * Compact token count — `812` / `96.2k` / `1.4M`. Directional usage supplies the semantic
 * context around this deliberately unit-less number (`IN 96.2k · OUT 1.8k`).
 *
 * Truncates rather than rounds: `999_999` reads `999.9k`, never a `1000.0k` that is really 1M.
 */
export function compactTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0'
  if (tokens >= 1_000_000) return `${(Math.floor(tokens / 100_000) / 10).toFixed(1)}M`
  if (tokens >= 1_000) return `${(Math.floor(tokens / 100) / 10).toFixed(1)}k`
  return String(Math.floor(tokens))
}
