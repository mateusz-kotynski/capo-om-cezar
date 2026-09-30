import { formatLocale } from '@/lib/locale'

type Lang = 'en' | 'pl'

/** The language the on-screen figures are worded in. Exports pass `'en'` explicitly: a CSV /
 *  PDF report is a document, not UI, and stays in one language. */
const uiLang = (): Lang => (formatLocale() === 'pl' ? 'pl' : 'en')

export function formatAmount(value: number | null | undefined, usd = false, lang: Lang = uiLang()) {
  if (value == null) return lang === 'pl' ? 'Niedostępne' : 'Unavailable'
  if (!usd) return value.toLocaleString(lang === 'pl' ? 'pl' : 'en-US')
  const text = value.toFixed(value === 0 || value >= 1 ? 2 : Math.min(20, Math.max(4, Math.ceil(-Math.log10(value)) + 1)))
  return `$${lang === 'pl' ? text.replace('.', ',') : text}`
}

export function formatHours(value: number | null, lang: Lang = uiLang()) {
  if (value === null) return lang === 'pl' ? 'Niedostępne' : 'Unavailable'
  const minutes = lang === 'pl' ? ' min' : 'm'
  const hours = lang === 'pl' ? ' godz.' : 'h'
  const days = lang === 'pl' ? ' d' : 'd'
  const fixed = (n: number) => (lang === 'pl' ? n.toFixed(1).replace('.', ',') : n.toFixed(1))
  return value < 1
    ? `${Math.round(value * 60)}${minutes}`
    : value < 48
      ? `${fixed(value)}${hours}`
      : `${fixed(value / 24)}${days}`
}
