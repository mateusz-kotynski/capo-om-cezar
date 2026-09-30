import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/query-client'
import { ListViewProvider } from '@/components/list-view'
import { LocaleProvider } from '@/components/locale-provider'
import { LOCALE_STORAGE_KEY } from '@/lib/locale'
import { TasksOverview } from '@/routes/tasks-overview'

// The whole point of these: the same components the English suites render, switched to Polish by
// the stored preference alone — no prop, no test seam.
describe('Tasks overview in Polish', () => {
  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pl')
  })
  afterEach(() => {
    cleanup()
    localStorage.removeItem(LOCALE_STORAGE_KEY)
    document.documentElement.removeAttribute('lang')
  })

  function renderPl(view: 'active' | 'archived') {
    return render(
      <QueryClientProvider client={createQueryClient()}>
        <LocaleProvider>
          <ListViewProvider>
            <MemoryRouter>
              <TasksOverview
                runs={[]}
                view={view}
                onViewChange={() => {}}
                onArchiveFinished={() => {}}
                onMarkAllRead={() => {}}
                onRename={() => {}}
              />
            </MemoryRouter>
          </ListViewProvider>
        </LocaleProvider>
      </QueryClientProvider>,
    )
  }

  it('renders the header, tabs, search and empty state in Polish and stamps <html lang>', () => {
    renderPl('active')

    expect(screen.getByRole('heading', { name: 'Zadania' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Aktywne/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Zarchiwizowane/ })).toBeTruthy()
    expect(screen.getByPlaceholderText('Szukaj zadań…')).toBeTruthy()
    expect(screen.getByText('Brak zadań')).toBeTruthy()
    expect(document.documentElement.lang).toBe('pl')
  })

  it('renders the archive empty state in Polish', () => {
    renderPl('archived')

    expect(screen.getByText('Nic jeszcze nie zarchiwizowano')).toBeTruthy()
  })
})
