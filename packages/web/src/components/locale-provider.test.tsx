import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCALE_STORAGE_KEY, type Locale } from '@/lib/locale'
import { LocaleProvider, useLocale } from './locale-provider'

afterEach(cleanup)

let setLocale: (locale: Locale) => void
let seen: { locale: Locale; tasks: string; count1: string; count5: string }

function Probe() {
  const { locale, setLocale: set, t, tn } = useLocale()
  setLocale = set
  seen = {
    locale,
    tasks: t('nav.tasks'),
    count1: tn('tasksPage.count', 1),
    count5: tn('tasksPage.count', 5),
  }
  return <span data-testid="probe">{locale}</span>
}

function renderProvider() {
  return render(
    <LocaleProvider>
      <Probe />
    </LocaleProvider>,
  )
}

const root = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  root().lang = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LocaleProvider', () => {
  it('defaults to English when jsdom reports an English navigator language (the default test env)', () => {
    renderProvider()

    expect(screen.getByTestId('probe').textContent).toBe('en')
    expect(seen.tasks).toBe('Tasks')
    expect(seen.count1).toBe('1 task')
    expect(seen.count5).toBe('5 tasks')
    expect(root().lang).toBe('en')
  })

  it('seeds an explicit stored preference and stamps <html lang>', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pl')
    renderProvider()

    expect(seen.locale).toBe('pl')
    expect(seen.tasks).toBe('Zadania')
    expect(seen.count1).toBe('1 zadanie')
    expect(seen.count5).toBe('5 zadań')
    expect(root().lang).toBe('pl')
  })

  it('detects Polish from navigator.language when nothing is stored', () => {
    vi.stubGlobal('navigator', { language: 'pl-PL' })
    renderProvider()

    expect(seen.locale).toBe('pl')
    expect(root().lang).toBe('pl')
  })

  it('switching locale takes effect immediately and persists to storage', () => {
    renderProvider()
    expect(seen.locale).toBe('en')

    act(() => setLocale('pl'))

    expect(seen.locale).toBe('pl')
    expect(seen.tasks).toBe('Zadania')
    expect(root().lang).toBe('pl')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl')
  })

  it('switching back to English updates <html lang> and persists', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pl')
    renderProvider()
    expect(root().lang).toBe('pl')

    act(() => setLocale('en'))

    expect(seen.locale).toBe('en')
    expect(root().lang).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('a fresh mount after a reload picks up the persisted choice (survives navigation/reload)', () => {
    renderProvider()
    act(() => setLocale('pl'))
    cleanup()

    renderProvider()

    expect(seen.locale).toBe('pl')
    expect(root().lang).toBe('pl')
  })

  it('keeps working when storage is unreadable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })

    expect(() => renderProvider()).not.toThrow()
    act(() => setLocale('pl'))
    expect(seen.locale).toBe('pl')
  })
})

describe('useLocale', () => {
  it('throws outside a provider rather than silently rendering untranslated keys', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow(/useLocale\(\) must be called inside <LocaleProvider>/)
  })
})
