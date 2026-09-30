import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LocaleProvider } from '@/components/locale-provider'
import { LOCALE_STORAGE_KEY } from '@/lib/locale'

import { TrackerLabelFilter } from './tracker-label-filter'

afterEach(() => {
  cleanup()
  localStorage.removeItem(LOCALE_STORAGE_KEY)
  document.documentElement.removeAttribute('lang')
})

describe('TrackerLabelFilter in Polish', () => {
  it('words the trigger in Polish and keeps the label data as-is', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pl')
    render(
      <LocaleProvider>
        <TrackerLabelFilter options={['bug']} selected={['bug']} onChange={() => {}} />
      </LocaleProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Filtruj etykiety' })
    expect(trigger.textContent).toBe('Etykiety · 1')
  })
})
