import { describe, expect, it } from 'vitest'
import type { HealthResponse } from '@open-mercato/cezar-api-client'

import { forgeNote, toolsBlocker, toolsTooltip } from '@/components/tools-menu'
import { describeRunNotification } from '@/lib/notifications'
import { REFERENCE_STATUS } from '@/lib/reference-status'

import { resolveMessage } from './format'
import { referencePresentation } from './ui-labels'

const tEn = (key: Parameters<typeof resolveMessage>[1], params?: Record<string, string | number>) => resolveMessage('en', key, params)
const tPl = (key: Parameters<typeof resolveMessage>[1], params?: Record<string, string | number>) => resolveMessage('pl', key, params)

const health = (over: Partial<HealthResponse>): HealthResponse =>
  ({ version: '1.2.3', checks: [], defaultRunner: 'claude', forge: null, ...over }) as HealthResponse

const POLISH_LABELS = {
  draft: 'Draft',
  'review-required': 'Czeka na przegląd',
  'changes-requested': 'Wymagane zmiany',
  'checks-pending': 'Checki w toku',
  'checks-failing': 'Checki niezaliczone',
  ready: 'Gotowy do scalenia',
  merged: 'Scalony',
  closed: 'Zamknięty',
  open: 'Otwarte',
  completed: 'Zamknięte jako ukończone',
  'not-planned': 'Zamknięte jako niezaplanowane',
} as const

describe('reference presentation', () => {
  it('is English-identical to the pure table for every status and translates in Polish', () => {
    for (const [status, base] of Object.entries(REFERENCE_STATUS)) {
      const en = referencePresentation(tEn, status as keyof typeof REFERENCE_STATUS)
      expect(en, status).toEqual(base)
      const pl = referencePresentation(tPl, status as keyof typeof REFERENCE_STATUS)
      expect(pl?.tone).toBe(base.tone)
      expect(pl?.label, status).toBe(POLISH_LABELS[status as keyof typeof REFERENCE_STATUS])
    }
    expect(referencePresentation(tPl, 'conflict')?.label).toBe('Konflikty scalania')
    expect(referencePresentation(tPl, undefined)).toBeUndefined()
  })
})

describe('tools menu text', () => {
  it('keeps the English sentences and speaks Polish through a translator', () => {
    const h = health({ checks: [{ name: 'claude', available: false }, { name: 'codex', available: true }] as HealthResponse['checks'] })
    expect(toolsBlocker(h)).toBe('default runner (claude) not found')
    expect(toolsBlocker(h, tPl)).toBe('nie znaleziono domyślnego runnera (claude)')
    expect(toolsTooltip(health({}), tPl)).toBe('cezar v1.2.3')
    expect(forgeNote(health({}))).toMatch(/^No GitHub remote detected/)
    expect(forgeNote(health({}), tPl)).toMatch(/^Nie wykryto remote/)
  })
})

describe('notification body', () => {
  it('stays "Task <label>" in English and follows the language when given a translator', () => {
    const run = { id: 'r1', title: 'T', status: 'done', archived: false } as Parameters<typeof describeRunNotification>[0]
    expect(describeRunNotification(run).body).toBe('Task done')
    expect(describeRunNotification(run, tPl, (l) => (l === 'done' ? 'gotowe' : l)).body).toBe('Zadanie: gotowe')
  })
})
