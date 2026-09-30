import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/api/query-client'
import { workspaceQueryKeys } from '@/api/queries'
import { AppearanceProvider } from '@/components/appearance-provider'
import { LocaleProvider } from '@/components/locale-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { LOCALE_STORAGE_KEY } from '@/lib/locale'
import { AppearanceSection } from './appearance'

/**
 * Settings → Appearance's project-order reset (#952). The order itself is set by dragging the
 * drawer; this section owns the undo, and the rule worth pinning is that the undo is ABSENT
 * whenever it could only do nothing — a reset button for state the user has never created is a
 * dead control, and the sidebar's own emptiness is not something Settings should announce.
 */

const RESET = '[data-slot="appearance-project-order-reset"]'

let requests: Array<{ method: string; url: string; body?: unknown }> = []

function serve(uiState: Record<string, unknown> = {}) {
  requests = []
  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined
      requests.push({ method, url, body })
      if (url === '/api/v1/workspace/ui-state' && method === 'GET') return json(uiState)
      if (url === '/api/v1/workspace/ui-state' && method === 'PUT')
        return json({ ...uiState, ...(body as Record<string, unknown>) })
      return new Promise<never>(() => {})
    }),
  )
}

/** The registry is seeded rather than fetched: this section only asks it "more than one?". */
function seedProjects(client: QueryClient, ids: string[]) {
  client.setQueryData(workspaceQueryKeys.projects, {
    projects: ids.map((id) => ({
      id,
      name: id,
      root: `/home/me/${id}`,
      addedAt: '2026-07-01T00:00:00.000Z',
      lastOpenedAt: '2026-07-20T00:00:00.000Z',
      source: 'local',
      status: 'ok',
    })),
    bootProject: ids[0] ?? 'cezar',
    projectsDir: '~/cezar/projects',
  })
}

function renderSection(projectIds: string[]) {
  const client = createQueryClient()
  seedProjects(client, projectIds)
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <ThemeProvider>
          <AppearanceProvider>
            <AppearanceSection />
          </AppearanceProvider>
        </ThemeProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => serve())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('Settings → Appearance: project order', () => {
  it('offers the reset once an order has been stored', async () => {
    serve({ sidebar: { collapsed: { cezar: true }, projectOrder: ['shop', 'cezar'] } })
    renderSection(['cezar', 'shop'])

    await waitFor(() => expect(document.querySelector(RESET)).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }))

    // Forgetting the order is the key going away — not an empty list, which would read as "the
    // user placed nothing on purpose" — and the legacy collapse map rides along untouched.
    await waitFor(() => expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(1))
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
      sidebar: { collapsed: { cezar: true } },
    })
  })

  it('stays absent when nothing has been reordered', async () => {
    serve({ appearance: { accent: 'violet' } })
    renderSection(['cezar', 'shop'])

    await waitFor(() => expect(screen.getByText('Reading width')).not.toBeNull())
    expect(document.querySelector(RESET)).toBeNull()
  })

  it('stays absent in a single-project workspace, order or no order', async () => {
    // The grouped sidebar does not render below two projects, so there is no order to undo.
    serve({ sidebar: { projectOrder: ['cezar'] } })
    renderSection(['cezar'])

    await waitFor(() => expect(screen.getByText('Reading width')).not.toBeNull())
    expect(document.querySelector(RESET)).toBeNull()
  })
})

/**
 * The Language control (this task): a segmented radio group right beside Theme, offering
 * English / Polski, applying immediately and persisting to the same per-browser storage key
 * `LocaleProvider` reads on boot (`lib/locale.ts`) — never a server round trip.
 */
describe('Settings → Appearance: language', () => {
  it('renders beside Theme, defaulting to English in this (English-navigator) test env', async () => {
    renderSection(['cezar'])

    await waitFor(() => expect(screen.getByText('Language')).not.toBeNull())
    const group = screen.getByRole('radiogroup', { name: 'Language' })
    expect(group.querySelector('[data-value="en"][aria-checked="true"]')).not.toBeNull()
    expect(screen.getByRole('radio', { name: 'Polski' })).not.toBeNull()
  })

  it('switching to Polski applies immediately (the section itself re-renders in Polish) and persists', async () => {
    renderSection(['cezar'])
    await waitFor(() => expect(screen.getByText('Language')).not.toBeNull())

    fireEvent.click(screen.getByRole('radio', { name: 'Polski' }))

    // Immediate effect: this same section's OWN labels flip, not just the control that was clicked.
    await waitFor(() => expect(screen.getByText('Motyw')).not.toBeNull())
    expect(screen.getByText('Akcent')).not.toBeNull()
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl')
    expect(document.documentElement.lang).toBe('pl')
  })
})
