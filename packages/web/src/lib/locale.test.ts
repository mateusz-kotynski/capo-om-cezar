import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  applyLocale,
  detectBrowserLocale,
  formatLocale,
  normalizeLocale,
  readStoredLocale,
  setActiveLocale,
  writeStoredLocale,
} from './locale'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('normalizeLocale', () => {
  it.each(['en', 'pl'] as const)('passes %s through', (locale) => {
    expect(normalizeLocale(locale)).toBe(locale)
  })

  it.each([undefined, null, '', 'PL', 'fr', 42, {}])('rejects the untyped value %o', (garbage) => {
    expect(normalizeLocale(garbage)).toBeNull()
  })
})

describe('detectBrowserLocale', () => {
  it.each(['pl', 'pl-PL', 'PL-pl', 'pl-x-custom'])('detects Polish from %o', (language) => {
    expect(detectBrowserLocale(language)).toBe('pl')
  })

  it.each(['en', 'en-US', 'de', 'de-DE', 'fr-FR', '', undefined, null])(
    'falls back to English for %o',
    (language) => {
      expect(detectBrowserLocale(language)).toBe('en')
    },
  )
})

describe('readStoredLocale', () => {
  it('returns the stored preference when there is one', () => {
    writeStoredLocale('pl')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl')
    expect(readStoredLocale()).toBe('pl')
  })

  it('falls back to the browser language when nothing is stored — Polish', () => {
    vi.stubGlobal('navigator', { language: 'pl-PL' })
    expect(readStoredLocale()).toBe('pl')
  })

  it('falls back to the browser language when nothing is stored — everything else', () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(readStoredLocale()).toBe('en')
  })

  it('ignores a garbage stored value and falls back to detection', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    vi.stubGlobal('navigator', { language: 'pl-PL' })
    expect(readStoredLocale()).toBe('pl')
  })

  it('survives storage being unavailable, still detecting from the browser', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    vi.stubGlobal('navigator', { language: 'pl-PL' })
    expect(readStoredLocale()).toBe('pl')
  })

  it('defaults to English when storage AND navigator are both unusable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    vi.stubGlobal('navigator', undefined)
    expect(readStoredLocale()).toBe(DEFAULT_LOCALE)
  })
})

describe('writeStoredLocale', () => {
  it('round-trips through the storage key', () => {
    writeStoredLocale('pl')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl')
  })

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(() => writeStoredLocale('pl')).not.toThrow()
  })
})

describe('applyLocale', () => {
  it('stamps the root element lang attribute', () => {
    const root = document.createElement('html')
    applyLocale(root, 'pl')
    expect(root.lang).toBe('pl')
    applyLocale(root, 'en')
    expect(root.lang).toBe('en')
  })
})

describe('formatLocale', () => {
  it('pins Polish formatting once Polish is active, and follows the browser for English', () => {
    setActiveLocale('pl')
    expect(formatLocale()).toBe('pl')
    expect(new Intl.DateTimeFormat(formatLocale(), { day: 'numeric', month: 'long' }).format(new Date(2026, 0, 15))).toBe('15 stycznia')

    setActiveLocale('en')
    expect(formatLocale()).toBeUndefined()
  })
})
