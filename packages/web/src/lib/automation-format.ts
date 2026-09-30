import {
  hm,
  normalizeSchedule,
  zonedParts,
  type AutomationDefinition,
  type AutomationSchedule,
  type RunStatus,
} from '@open-mercato/cezar-api-client'

import type { StatusDotTone } from '@/components/status-dot'
import type { TFn } from '@/components/locale-provider'
import { resolveMessage } from '@/i18n/format'

/**
 * The Automations surface's small formatting vocabulary (spec 2026-09-14-automations-redesign
 * § UI/UX). Every time shown on the page is rendered in the SERVER's zone — the one the
 * schedules are evaluated in — never the browser's, so a cockpit opened from another zone shows
 * the same "Thu 04:00" the timer will fire at.
 */

export { hm }

/** Every helper below takes an optional translator; without one they speak English, exactly as
 *  before the UI had a language (the pure tests and any provider-less caller). */
const englishT: TFn = (key, params) => resolveMessage('en', key, params)

const WEEKDAY_KEYS = [
  'automations.dayMon', 'automations.dayTue', 'automations.dayWed', 'automations.dayThu',
  'automations.dayFri', 'automations.daySat', 'automations.daySun',
] as const
const MONTH_KEYS = [
  'automations.monthJan', 'automations.monthFeb', 'automations.monthMar', 'automations.monthApr',
  'automations.monthMay', 'automations.monthJun', 'automations.monthJul', 'automations.monthAug',
  'automations.monthSep', 'automations.monthOct', 'automations.monthNov', 'automations.monthDec',
] as const
const WEEKLY_KEYS = [
  'automations.weeklyMon', 'automations.weeklyTue', 'automations.weeklyWed', 'automations.weeklyThu',
  'automations.weeklyFri', 'automations.weeklySat', 'automations.weeklySun',
] as const

/** `Jan` … `Dec` (1-based month). */
export function monthName(month: number, t: TFn = englishT): string {
  const key = MONTH_KEYS[month - 1]
  return key ? t(key) : ''
}

/** The trigger text of a schedule: `every day at 04:00`, `weekdays at 07:30`, `every 6 hours`,
 *  `Tuesdays at 02:00` — the contract's `scheduleLabel`, worded through the dictionary. */
export function scheduleText(schedule: AutomationSchedule, t: TFn = englishT): string {
  const s = normalizeSchedule(schedule)
  const time = hm(s.hour, s.minute)
  switch (s.type) {
    case 'daily': return t('automations.scheduleDaily', { time })
    case 'weekdays': return t('automations.scheduleWeekdays', { time })
    case 'hours': return s.every === 1 ? t('automations.scheduleHourOne') : t('automations.scheduleHours', { count: s.every })
    case 'weekly': return t(WEEKLY_KEYS[s.day - 1] ?? WEEKLY_KEYS[0], { time })
  }
}

/**
 * Whether the Automations screens show dollar figures at all (owner decision, 2026-09-15:
 * hidden for now). The server keeps answering `costUsd` / `costUsd7d` / `stats.costUsd` under
 * `capabilities.costMetrics`; flipping this back to `true` restores the spent figure, the
 * Cost 7d column, and the cost cells of the log and the last-run card.
 */
export const AUTOMATION_COST_VISIBLE = false

/** `Mon` … `Sun` for an ISO weekday (Monday = 1). */
export function dayName(weekday: number, t: TFn = englishT): string {
  const key = WEEKDAY_KEYS[((weekday - 1) % 7 + 7) % 7]
  return key ? t(key) : ''
}

/** `Thu 04:00` in the zone; `''` for an unknown zone or a bad instant. */
export function dayTime(iso: string | number, timeZone: string, t: TFn = englishT): string {
  const parts = zonedParts(typeof iso === 'number' ? iso : Date.parse(iso), timeZone)
  return parts ? `${dayName(parts.weekday, t)} ${hm(parts.hour, parts.minute)}` : ''
}

/** `HH:MM` in the zone. */
export function timeOnly(iso: string | number, timeZone: string): string {
  const parts = zonedParts(typeof iso === 'number' ? iso : Date.parse(iso), timeZone)
  return parts ? hm(parts.hour, parts.minute) : ''
}

/** The log row's stamp: `Wed 04:00` within the last six days, `12 Sep 04:00` beyond. */
export function logTime(iso: string, timeZone: string, now = Date.now(), t: TFn = englishT): string {
  const ms = Date.parse(iso)
  const parts = zonedParts(ms, timeZone)
  if (!parts) return ''
  if (now - ms < 6 * 86_400_000) return `${dayName(parts.weekday, t)} ${hm(parts.hour, parts.minute)}`
  return `${parts.day} ${monthName(parts.month, t)} ${hm(parts.hour, parts.minute)}`
}

/** `in 12m` / `in 3h` / `in 2d` — the rail's and the preview's relative column. */
export function relativeIn(ms: number, now = Date.now(), t: TFn = englishT): string {
  const minutes = Math.max(0, Math.round((ms - now) / 60_000))
  if (minutes < 60) return t('automations.inMinutes', { count: minutes })
  if (minutes < 1_440) return t('automations.inHours', { count: Math.round(minutes / 60) })
  return t('automations.inDays', { count: Math.round(minutes / 1_440) })
}

/** `4h 12m` / `12m` / `0m` — the strip's agent time. */
export function agentTime(seconds: number, t: TFn = englishT): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0
    ? t('automations.agentHours', { hours, minutes: String(minutes % 60).padStart(2, '0') })
    : t('automations.agentMinutes', { minutes })
}

/** `$13.4` above ten dollars, `$2.41` below — the design's two spellings. */
export function usd(value: number): string {
  return value >= 10 ? `$${value.toFixed(1)}` : `$${value.toFixed(2)}`
}

/** The dot beside a run's state: done → success, running → pending, failed → danger, review → violet. */
export function statusTone(status: RunStatus): StatusDotTone {
  switch (status) {
    case 'done': return 'success'
    case 'running': case 'queued': case 'waiting': return 'pending'
    case 'failed': case 'cancelled': return 'danger'
    case 'review': return 'violet'
  }
}

/** The word beside that dot. */
export function statusLabel(status: RunStatus, t: TFn = englishT): string {
  switch (status) {
    case 'review': return t('automations.needsReview')
    case 'waiting': return t('automations.needsYou')
    case 'queued': return t('automations.runStatusQueued')
    case 'running': return t('automations.runStatusRunning')
    case 'done': return t('automations.runStatusDone')
    case 'failed': return t('automations.runStatusFailed')
    case 'cancelled': return t('automations.runStatusCancelled')
    default: return status
  }
}

/** The trigger cell: `on issue.opened · every 5 min` for a poll, `scheduleLabel` for a schedule. */
export function triggerLabel(automation: Pick<AutomationDefinition, 'kind' | 'events' | 'intervalSeconds' | 'schedule' | 'trackerTrigger'>, t: TFn = englishT): string {
  if (automation.kind === 'schedule' && automation.schedule) return scheduleText(automation.schedule, t)
  if (automation.kind === 'tracker') {
    const trigger = automation.trackerTrigger
    const provider = trigger?.association.kind === 'jira' ? 'Jira' : trigger?.association.kind === 'linear' ? 'Linear' : t('automations.providerTracker')
    return trigger
      ? t('automations.trackerTrigger', {
          provider,
          events: trigger.events.join(', '),
          statuses: trigger.targetStatusIds?.length ? t('automations.trackerStatusesPart', { ids: trigger.targetStatusIds.join(', ') }) : '',
          labels: trigger.changedLabelIds?.length ? t('automations.trackerLabelsPart', { ids: trigger.changedLabelIds.join(', ') }) : '',
          minutes: Math.round((automation.intervalSeconds ?? 1800) / 60),
        })
      : t('automations.trackerIncomplete', { provider })
  }
  const events = (automation.events ?? []).join(', ')
  const minutes = Math.round((automation.intervalSeconds ?? 300) / 60)
  return t('automations.githubTrigger', { events: events || 'github', minutes })
}

/** The log result's dot tone (spec § UI/UX 5). */
export function resultTone(result: string): StatusDotTone {
  switch (result) {
    case 'launched': case 'manual': case 'catch-up': return 'success'
    case 'failed': case 'error': case 'rate-limited': return 'danger'
    default: return 'neutral'
  }
}
