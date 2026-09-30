import { afterEach, describe, expect, it } from 'vitest'

import { compactTokens, shortAge } from '@/lib/format'
import { LOCALE_STORAGE_KEY, setActiveLocale } from '@/lib/locale'

describe('shortAge in Polish', () => {
  const now = Date.parse('2026-07-14T12:00:00.000Z')
  afterEach(() => {
    setActiveLocale('en')
    localStorage.removeItem(LOCALE_STORAGE_KEY)
  })

  it('uses the Polish abbreviations when the UI language is Polish', () => {
    setActiveLocale('pl')
    const ago = (ms: number) => new Date(now - ms).toISOString()
    expect(shortAge(ago(4_000), now)).toBe('4 s')
    expect(shortAge(ago(26 * 60_000), now)).toBe('26 min')
    expect(shortAge(ago(2 * 3_600_000), now)).toBe('2 godz.')
    expect(shortAge(ago(3 * 86_400_000), now)).toBe('3 d')
  })
})

describe('shortAge', () => {
  const now = Date.parse('2026-07-14T12:00:00.000Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it.each([
    [0, '0s'],
    [4_000, '4s'],
    [59_999, '59s'],
    [60_000, '1m'],
    [26 * 60_000, '26m'],
    [3_599_000, '59m'],
    [3_600_000, '1h'],
    [2 * 3_600_000, '2h'],
    [86_399_000, '23h'],
    [86_400_000, '1d'],
    [3 * 86_400_000, '3d'],
    [400 * 86_400_000, '400d'],
  ])('%d ms ago → %s', (ms, expected) => {
    expect(shortAge(ago(ms), now)).toBe(expected)
  })

  it('clamps a future timestamp to 0s rather than printing a negative age', () => {
    // The server stamps the time; the browser's clock may be behind it.
    expect(shortAge(new Date(now + 5_000).toISOString(), now)).toBe('0s')
  })

  it.each([undefined, '', 'not a date'])('renders nothing for %s', (iso) => {
    expect(shortAge(iso, now)).toBe('')
  })
})

describe('compactTokens', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [812, '812'],
    [999, '999'],
    [1_000, '1.0k'],
    [96_249, '96.2k'],
    // Truncated, not rounded: this must not read `1000.0k`.
    [999_999, '999.9k'],
    [1_000_000, '1.0M'],
    [1_449_999, '1.4M'],
  ])('%d → %s', (tokens, expected) => {
    expect(compactTokens(tokens)).toBe(expected)
  })

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY])('renders %s as 0', (tokens) => {
    expect(compactTokens(tokens)).toBe('0')
  })
})
