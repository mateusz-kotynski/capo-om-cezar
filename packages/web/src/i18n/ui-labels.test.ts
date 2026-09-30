import { describe, expect, it } from 'vitest'

import { NAV_ITEMS, visibleNavItems } from '@/components/nav-items'
import { deriveAttention } from '@/lib/attention'
import { gitActionPolicy, type GitAction, type GitActionState } from '@/lib/git-actions'
import { TASK_COLUMNS } from '@/lib/task-columns'
import type { RunStatus } from '@open-mercato/cezar-api-client'

import { resolveMessage } from './format'
import { attentionLabel, gitActionLabel, gitActionReason, navItemLabel, taskColumnLabel } from './ui-labels'

// Real translators for both languages, and a sentinel one that echoes the dictionary key — a
// label the maps do not know passes through unchanged (never a `namespace.key` path), so the
// echo translator tells "mapped" from "silently untranslated" without reading any Polish.
const tEn = (key: Parameters<typeof resolveMessage>[1], params?: Record<string, string | number>) =>
  resolveMessage('en', key, params)
const tPl = (key: Parameters<typeof resolveMessage>[1], params?: Record<string, string | number>) =>
  resolveMessage('pl', key, params)
const tKey = (key: string) => key

const STATUSES: RunStatus[] = ['queued', 'running', 'waiting', 'review', 'done', 'failed', 'cancelled']

/** Every attention label `deriveAttention` can produce, found by walking its input space. */
function emittedAttentionLabels(): string[] {
  const labels = new Set<string>()
  for (const status of STATUSES) {
    for (const activity of [undefined, 'monitoring'] as const) {
      for (const autoResumeAt of [undefined, '2026-01-01T00:00:00Z']) {
        labels.add(deriveAttention({ status, activity, autoResumeAt } as Parameters<typeof deriveAttention>[0]).label)
      }
    }
  }
  return [...labels]
}

describe('attentionLabel', () => {
  it('has a dictionary key for every label lib/attention.ts can emit', () => {
    const labels = emittedAttentionLabels()
    // Sanity: the walk really reaches the whole ladder, so a new rung shows up here.
    expect(labels.sort()).toEqual(
      ['cancelled', 'done', 'failed', 'monitoring', 'needs review', 'needs you', 'queued', 'running', 'scheduled'].sort(),
    )
    const unmapped = labels.filter((label) => !attentionLabel(tKey, label).startsWith('tasks.status.'))
    expect(unmapped).toEqual([])
  })

  it('also maps the two reserved rungs (permission, unseen) that no data feeds yet', () => {
    expect(attentionLabel(tKey, 'needs permission')).toBe('tasks.status.needsPermission')
    expect(attentionLabel(tKey, 'unseen')).toBe('tasks.status.unseen')
  })

  it('round-trips English unchanged and translates to Polish', () => {
    for (const label of emittedAttentionLabels()) {
      expect(attentionLabel(tEn, label)).toBe(label)
      expect(attentionLabel(tPl, label)).not.toBe('')
    }
    expect(attentionLabel(tPl, 'needs you')).toBe('czeka na Ciebie')
  })

  it('passes an unknown label through untouched', () => {
    expect(attentionLabel(tPl, 'something new')).toBe('something new')
  })
})

/** A grid over every input `gitActionPolicy` branches on. */
function everyGitAction(): GitAction[] {
  const actions: GitAction[] = []
  for (const status of STATUSES) {
    for (const hasWorktree of [true, false]) {
      for (const branch of [undefined, 'feat/x']) {
        for (const changedFiles of [undefined, 0, 3]) {
          for (const remote of [undefined, 'origin']) {
            for (const forge of [null, { kind: 'github', available: true }, { kind: 'github', available: false }] as const) {
              for (const localHandoff of [true, false]) {
                for (const hasSession of [true, false]) {
                  for (const prUrl of [undefined, 'https://example.test/pr/1']) {
                    const state = {
                      status, hasWorktree, branch, changedFiles, remote, forge, localHandoff, hasSession, prUrl,
                    } as GitActionState
                    const bar = gitActionPolicy(state)
                    actions.push(bar.primary, ...bar.secondary, ...bar.menu)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return actions
}

describe('gitActionLabel / gitActionReason', () => {
  const actions = everyGitAction()

  it('has a key for every action label gitActionPolicy can emit', () => {
    const ids = new Set(actions.map((action) => action.id))
    expect([...ids].sort()).toEqual(['commit', 'create-pr', 'open-terminal', 'push', 'view-pr'])
    for (const action of actions) {
      expect(gitActionLabel(tKey, action.id, action.label), action.id).toMatch(/^git\.toolbar\./)
      expect(gitActionLabel(tEn, action.id, action.label)).toBe(action.label)
    }
  })

  it('has a key for every disabled reason lib/git-actions.ts can emit (except the forge’s own dynamic one)', () => {
    const reasons = new Set(actions.map((action) => action.reason).filter((r): r is string => r !== undefined))
    expect(reasons.size).toBeGreaterThan(10)
    const dynamic = (reason: string) =>
      reason.startsWith('Create PR unavailable — ') &&
      !reason.includes('no worktree') &&
      !reason.includes('no supported forge') &&
      !reason.includes('still active')
    for (const reason of reasons) {
      if (dynamic(reason)) {
        // A forge's own reason (server text) is passed through untouched, by design.
        expect(gitActionReason(tPl, reason)).toBe(reason)
        continue
      }
      expect(gitActionReason(tKey, reason), reason).toMatch(/^git\.reasons\./)
      // English is the identity, so the English UI is byte-identical to the pure module.
      expect(gitActionReason(tEn, reason), reason).toBe(reason)
      expect(gitActionReason(tPl, reason), reason).not.toBe(reason)
    }
  })

  it('leaves an absent or unknown reason alone', () => {
    expect(gitActionReason(tPl, undefined)).toBeUndefined()
    expect(gitActionReason(tPl, 'Create PR unavailable — the forge is unreachable')).toBe(
      'Create PR unavailable — the forge is unreachable',
    )
  })
})

describe('navItemLabel', () => {
  it('translates every static nav item and keeps English identical', () => {
    for (const item of NAV_ITEMS) {
      expect(navItemLabel(tEn, item), item.to).toBe(item.label)
    }
    const polish = Object.fromEntries(NAV_ITEMS.map((item) => [item.to, navItemLabel(tPl, item)]))
    expect(polish['/']).toBe('Zadania')
    expect(polish['/inbox']).toBe('Skrzynka')
    expect(polish['/skills']).toBe('Skille')
    expect(polish['/workflows']).toBe('Workflow')
    expect(polish['/settings']).toBe('Ustawienia')
  })

  it('leaves the forge names and a connected tracker’s own name untouched', () => {
    expect(navItemLabel(tPl, { to: '/github', label: 'GitHub' })).toBe('GitHub')
    expect(navItemLabel(tPl, { to: '/github', label: 'GitLab' })).toBe('GitLab')
    const jira = visibleNavItems({ tracker: 'jira' }).find((item) => item.to === '/tracker')
    expect(jira).toBeDefined()
    expect(navItemLabel(tPl, jira!)).toBe(jira!.label)
    expect(navItemLabel(tPl, { to: '/tracker', label: 'Tracker' })).toBe('Tracker')
  })
})

describe('taskColumnLabel', () => {
  it('has a key for every column with a text label; English is the identity', () => {
    for (const column of TASK_COLUMNS) {
      expect(taskColumnLabel(tEn, column.id, column.label), column.id).toBe(column.label)
    }
    // `diff` is a "±" glyph and stays as-is in every language.
    expect(taskColumnLabel(tPl, 'diff', '±')).toBe('±')
  })

  it('translates the column headers in Polish', () => {
    expect(taskColumnLabel(tPl, 'branch', 'Branch')).toBe('Gałąź')
    expect(taskColumnLabel(tPl, 'memory', 'Memory')).toBe('Pamięć')
    expect(taskColumnLabel(tPl, 'task', 'Task')).toBe('Zadanie')
  })
})
