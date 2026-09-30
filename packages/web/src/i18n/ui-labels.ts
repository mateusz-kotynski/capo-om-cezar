import type { NavItem } from '@/components/nav-items'
import type { TaskColumnId } from '@/lib/task-columns'
import type { SettingsSection } from '@/routes/settings/registry'

import type { Messages } from './messages/types'
import type { StringPath } from './format'

type T = (key: StringPath<Messages>, params?: Record<string, string | number>) => string

/**
 * Translates a nav item's label AT THE RENDER SITE, without touching `nav-items.ts` —
 * `NavItem.to` stays the identity every consumer (the sidebar, the mobile drawer, the ⌘K
 * palette, the multi-project groups) matches against, so this can be dropped in wherever
 * `item.label` is rendered today.
 *
 * Two label kinds are deliberately left untranslated:
 *  - GitHub/GitLab (`item.to === '/github'`) — forge product names, not cockpit copy;
 *  - the Tracker item once `visibleNavItems` has already swapped its label for the connected
 *    provider's own name (Jira/Linear) — a proper noun, matching the same rule.
 * Everything else maps `to` → a `nav.*` key so English and Polish stay in the one dictionary.
 */
const STATIC_NAV_LABEL_KEYS: Partial<Record<NavItem['to'], StringPath<Messages>>> = {
  '/': 'nav.tasks',
  '/inbox': 'nav.inbox',
  '/git': 'nav.git',
  '/tracker': 'nav.tracker',
  '/automations': 'nav.automations',
  '/skills': 'nav.skills',
  '/workflows': 'nav.workflows',
  '/settings': 'nav.settings',
}

export function navItemLabel(t: T, item: Pick<NavItem, 'to' | 'label'>): string {
  if (item.to === '/tracker' && item.label !== 'Tracker') return item.label
  const key = STATIC_NAV_LABEL_KEYS[item.to]
  return key ? t(key) : item.label
}

/** Same idea for the desktop Tasks table's column headers (`lib/task-columns.ts`) — the pure
 *  module keeps its English `label` (persisted ids are never derived from it), and this maps
 *  the stable `id` to a dictionary key at the point columns are rendered. */
const TASK_COLUMN_LABEL_KEYS: Partial<Record<TaskColumnId, StringPath<Messages>>> = {
  status: 'tasks.columns.status',
  task: 'tasks.columns.task',
  workflow: 'tasks.columns.workflow',
  branch: 'tasks.columns.branch',
  reference: 'tasks.columns.ref',
  tokens: 'tasks.columns.tokens',
  cost: 'tasks.columns.cost',
  cpu: 'tasks.columns.cpu',
  memory: 'tasks.columns.mem',
  started: 'tasks.columns.started',
}

export function taskColumnLabel(t: T, id: TaskColumnId, fallback: string): string {
  const key = TASK_COLUMN_LABEL_KEYS[id]
  return key ? t(key) : fallback
}

/** `lib/attention.ts` keeps its English labels (they double as stable strings in tests and the
 *  notification path); every render site maps them here. Unknown labels pass through. */
const ATTENTION_LABEL_KEYS: Record<string, StringPath<Messages>> = {
  running: 'tasks.status.running',
  done: 'tasks.status.done',
  failed: 'tasks.status.failed',
  cancelled: 'tasks.status.cancelled',
  queued: 'tasks.status.queued',
  scheduled: 'tasks.status.scheduled',
  monitoring: 'tasks.status.monitoring',
  'needs you': 'tasks.status.needsYou',
  'needs review': 'tasks.status.needsReview',
  'needs permission': 'tasks.status.needsPermission',
  unseen: 'tasks.status.unseen',
}

export function attentionLabel(t: T, label: string): string {
  const key = ATTENTION_LABEL_KEYS[label]
  return key ? t(key) : label
}

/** The raw `RunRecord.status` words the cross-project page shows as facet options and group
 *  headings (as opposed to `attentionLabel`, which words the status DOT). English is the raw id,
 *  exactly as before; an unknown status passes through. */
const RUN_STATUS_KEYS: Record<string, StringPath<Messages>> = {
  queued: 'tasks.runStatus.queued',
  running: 'tasks.runStatus.running',
  waiting: 'tasks.runStatus.waiting',
  review: 'tasks.runStatus.review',
  done: 'tasks.runStatus.done',
  failed: 'tasks.runStatus.failed',
  cancelled: 'tasks.runStatus.cancelled',
}

export function runStatusLabel(t: T, status: string): string {
  const key = RUN_STATUS_KEYS[status]
  return key ? t(key) : status
}

/** Settings section titles/descriptions (`routes/settings/registry.tsx`) translated the same
 *  way — the registry keeps its English strings (used as the `comingSoon` fallback and by any
 *  code that logs/tests against them), and every render site (`SectionNav`, `SectionPills`,
 *  `SettingsSectionRoute`, `SettingsIndexRoute`) asks this instead of reading `section.title`/
 *  `section.description` directly. */
export function settingsSectionLabel(
  t: T,
  section: Pick<SettingsSection, 'id' | 'title' | 'description'>,
): { title: string; description: string } {
  const entry = (SETTINGS_SECTION_KEYS as Record<string, { title: StringPath<Messages>; description: StringPath<Messages> } | undefined>)[section.id]
  if (!entry) return { title: section.title, description: section.description }
  return { title: t(entry.title), description: t(entry.description) }
}

const SETTINGS_SECTION_KEYS = {
  tracker: { title: 'settings.sections.tracker.title', description: 'settings.sections.tracker.description' },
  agents: { title: 'settings.sections.agents.title', description: 'settings.sections.agents.description' },
  'agent-config': {
    title: 'settings.sections.agent-config.title',
    description: 'settings.sections.agent-config.description',
  },
  worktrees: { title: 'settings.sections.worktrees.title', description: 'settings.sections.worktrees.description' },
  bookmarklets: {
    title: 'settings.sections.bookmarklets.title',
    description: 'settings.sections.bookmarklets.description',
  },
  'prompt-templates': {
    title: 'settings.sections.prompt-templates.title',
    description: 'settings.sections.prompt-templates.description',
  },
  appearance: {
    title: 'settings.sections.appearance.title',
    description: 'settings.sections.appearance.description',
  },
  notifications: {
    title: 'settings.sections.notifications.title',
    description: 'settings.sections.notifications.description',
  },
  resources: { title: 'settings.sections.resources.title', description: 'settings.sections.resources.description' },
  skills: { title: 'settings.sections.skills.title', description: 'settings.sections.skills.description' },
  accounts: { title: 'settings.sections.accounts.title', description: 'settings.sections.accounts.description' },
  projects: { title: 'settings.sections.projects.title', description: 'settings.sections.projects.description' },
  keyboard: { title: 'settings.sections.keyboard.title', description: 'settings.sections.keyboard.description' },
} as const satisfies Record<string, { title: StringPath<Messages>; description: StringPath<Messages> }>

const GIT_ACTION_LABEL_KEYS: Record<string, StringPath<Messages>> = {
  commit: 'git.toolbar.actionCommit',
  push: 'git.toolbar.actionPush',
  'create-pr': 'git.toolbar.actionCreatePr',
  'view-pr': 'git.toolbar.actionViewPr',
  'open-terminal': 'git.toolbar.actionTerminal',
}

/** `lib/git-actions.ts` keeps its English label (its tests and policy stay pure); the toolbar
 *  maps by action id. */
export function gitActionLabel(t: T, id: string, fallback: string): string {
  const key = GIT_ACTION_LABEL_KEYS[id]
  return key ? t(key) : fallback
}

const NO_WORKTREE = 'no worktree — this task ran directly in the repo working tree'
const GIT_REASON_KEYS: Record<string, StringPath<Messages>> = {
  'Commit unavailable — the agent is still working in this worktree': 'git.reasons.commitRunning',
  'Commit unavailable — changes are still loading': 'git.reasons.commitLoading',
  'Commit unavailable — no changes to commit': 'git.reasons.commitNone',
  'Push unavailable — no remote configured': 'git.reasons.pushNoRemote',
  'Push unavailable — the run has no branch to push': 'git.reasons.pushNoBranch',
  'Push unavailable — the agent is still working in this worktree': 'git.reasons.pushRunning',
  'Create PR unavailable — no supported forge remote (GitHub) detected': 'git.reasons.prNoForge',
  'Create PR unavailable — the run is still active; wait for the review gate': 'git.reasons.prActive',
  'Terminal unavailable — no agent session to resume': 'git.reasons.terminalNoSession',
  'Terminal unavailable — the session is still active in the engine': 'git.reasons.terminalActive',
}
const GIT_NO_WORKTREE_KEYS: Record<string, StringPath<Messages>> = {
  'Commit unavailable': 'git.reasons.commitUnavailableNoWorktree',
  'Push unavailable': 'git.reasons.pushUnavailableNoWorktree',
  'Create PR unavailable': 'git.reasons.prUnavailableNoWorktree',
}

/** Disabled-reason tooltips from the git action policy; unknown (dynamic, e.g. a forge's own
 *  reason) strings pass through untouched. */
export function gitActionReason(t: T, reason: string | undefined): string | undefined {
  if (reason === undefined) return reason
  const exact = GIT_REASON_KEYS[reason]
  if (exact) return t(exact)
  for (const [prefix, key] of Object.entries(GIT_NO_WORKTREE_KEYS)) {
    if (reason === `${prefix} — ${NO_WORKTREE}`) return t(key, { reason: t('git.reasons.noWorktree') })
  }
  return reason
}
