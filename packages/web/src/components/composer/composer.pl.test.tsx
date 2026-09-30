import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/api/query-client'
import { LocaleProvider } from '@/components/locale-provider'
import { LOCALE_STORAGE_KEY } from '@/lib/locale'

import { Composer } from './composer'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'pl')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })),
    ),
  )
})

afterEach(() => {
  cleanup()
  localStorage.removeItem(LOCALE_STORAGE_KEY)
  document.documentElement.removeAttribute('lang')
  vi.unstubAllGlobals()
})

describe('Composer in Polish', () => {
  function renderPl() {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <LocaleProvider>
          <Composer onSubmit={() => Promise.resolve({})} />
        </LocaleProvider>
      </QueryClientProvider>,
    )
  }

  it('renders the input, send and attach controls in Polish', () => {
    renderPl()

    expect(screen.getByPlaceholderText('Odpowiedz — / dla skilli, @ dla plików…')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Odpowiedz agentowi' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wyślij' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Załącz pliki' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('words the slash-command list in Polish', async () => {
    renderPl()

    fireEvent.change(screen.getByRole('textbox', { name: 'Odpowiedz agentowi' }), { target: { value: '/' } })

    await waitFor(() => expect(screen.getByText('Brak pasujących skilli.')).toBeTruthy())
  })
})
