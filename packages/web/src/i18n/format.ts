import type { Locale } from '@/lib/locale'

import { en } from './messages/en'
import { pl } from './messages/pl'
import type { Messages } from './messages/types'
import type { PluralForms } from './plural-forms'

/** The full message dictionary shape — both `en.ts` and `pl.ts` are written directly against
 *  this type (see `messages/types.ts` for why that beats `typeof en`), so a Polish dictionary
 *  missing a key, carrying an extra one, or typing a leaf wrong is a compile error in `pl.ts`
 *  itself. */
export type { Messages } from './messages/types'
export type { PluralForms } from './plural-forms'

function isPluralForms(value: unknown): value is PluralForms {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).one === 'string' &&
    typeof (value as Record<string, unknown>).other === 'string' &&
    typeof (value as Record<string, unknown>).few === 'string' &&
    typeof (value as Record<string, unknown>).many === 'string'
  )
}

/** Every dot-separated path to a plain string leaf — what `t()` accepts. Excludes plural-form
 *  groups, which resolve through `tn()` instead, so a caller can never bypass the plural pick by
 *  accident and print the raw "other" form for a count of one. */
export type StringPath<T> = {
  [K in keyof T & string]: T[K] extends PluralForms
    ? never
    : T[K] extends string
      ? K
      : `${K}.${StringPath<T[K]>}`
}[keyof T & string]

/** Every dot-separated path to a plural-form group — what `tn()` accepts. */
export type PluralGroupPath<T> = {
  [K in keyof T & string]: T[K] extends PluralForms
    ? K
    : T[K] extends string
      ? never
      : `${K}.${PluralGroupPath<T[K]>}`
}[keyof T & string]

/** Runtime path lookup. The type-level paths above exist only to keep call sites honest — this
 *  is the one place that actually walks the dictionary object. */
function getIn(dict: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (typeof node !== 'object' || node === null) return undefined
    return (node as Record<string, unknown>)[key]
  }, dict)
}

/** `{name}` interpolation — the one placeholder syntax the whole dictionary uses. A missing
 *  param prints the placeholder verbatim rather than throwing: a translation typo must read as
 *  an obviously-wrong string, never blank the screen. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (Object.hasOwn(params, key) ? String(params[key]) : match))
}

const DICTIONARIES: Record<Locale, Messages> = { en, pl }

/** Resolves a string-leaf message and interpolates it. Falls back to the raw path when a
 *  dictionary is missing it at runtime — should never happen (`en.ts`/`pl.ts` both satisfy
 *  `Messages`), but a hand-edited path typo must read as an obviously-wrong string, not a blank
 *  one, and must never throw mid-render. */
export function resolveMessage(locale: Locale, path: string, params?: Record<string, string | number>): string {
  const raw = getIn(DICTIONARIES[locale], path)
  return interpolate(typeof raw === 'string' ? raw : path, params)
}

/** Picks the CLDR cardinal category for `count` in `locale`. Defensive about environments
 *  without `Intl.PluralRules` (very old engines) — falls back to the English one/other split. */
const PLURAL_RULES = new Map<Locale, Intl.PluralRules>()

export function pluralCategory(locale: Locale, count: number): keyof PluralForms {
  try {
    let rules = PLURAL_RULES.get(locale)
    if (!rules) {
      rules = new Intl.PluralRules(locale)
      PLURAL_RULES.set(locale, rules)
    }
    const category = rules.select(count)
    return category === 'one' || category === 'few' || category === 'many' ? category : 'other'
  } catch {
    return count === 1 ? 'one' : 'other'
  }
}

/** Resolves a plural-form message: picks the category via `Intl.PluralRules`, then
 *  interpolates — `{count}` is always available, even when the caller's own `params` doesn't
 *  repeat it. */
export function resolvePlural(
  locale: Locale,
  path: string,
  count: number,
  params?: Record<string, string | number>,
): string {
  const raw = getIn(DICTIONARIES[locale], path)
  const forms = isPluralForms(raw) ? raw : null
  const category = pluralCategory(locale, count)
  const template = forms ? forms[category] : path
  return interpolate(template, { count, ...params })
}
