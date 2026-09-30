import { scheduleLabel, type AutomationSchedule } from '@open-mercato/cezar-api-client'
import { describe, expect, it } from 'vitest'

import { resolveMessage } from '@/i18n/format'

import { agentTime, dayName, dayTime, logTime, relativeIn, resultTone, scheduleText, statusLabel, statusTone, timeOnly, triggerLabel, usd } from './automation-format'

const WARSAW = 'Europe/Warsaw'
const NOW = Date.parse('2026-09-16T08:24:00Z') // Wed 10:24 Warsaw

describe('automation-format', () => {
  it('renders day and time in the server zone', () => {
    expect(dayTime('2026-09-17T02:00:00Z', WARSAW)).toBe('Thu 04:00')
    expect(timeOnly('2026-09-17T02:00:00Z', WARSAW)).toBe('04:00')
    expect(dayName(1)).toBe('Mon')
    expect(dayName(7)).toBe('Sun')
    expect(dayTime('2026-09-17T02:00:00Z', 'Mars/Olympus')).toBe('')
  })

  it('stamps a log row with the weekday within six days and the date beyond', () => {
    expect(logTime('2026-09-16T02:00:00Z', WARSAW, NOW)).toBe('Wed 04:00')
    expect(logTime('2026-09-08T02:00:00Z', WARSAW, NOW)).toBe('8 Sep 04:00')
  })

  it('says how far away an instant is', () => {
    expect(relativeIn(NOW + 12 * 60_000, NOW)).toBe('in 12m')
    expect(relativeIn(NOW + 3 * 3_600_000, NOW)).toBe('in 3h')
    expect(relativeIn(NOW + 2 * 86_400_000, NOW)).toBe('in 2d')
    expect(relativeIn(NOW - 1, NOW)).toBe('in 0m')
  })

  it('formats agent time and dollars the way the design does', () => {
    expect(agentTime(4 * 3600 + 12 * 60)).toBe('4h 12m')
    expect(agentTime(12 * 60)).toBe('12m')
    expect(agentTime(0)).toBe('0m')
    expect(usd(13.4)).toBe('$13.4')
    expect(usd(2.41)).toBe('$2.41')
    expect(usd(0)).toBe('$0.00')
  })

  it('maps run states to dots and words', () => {
    expect(statusTone('done')).toBe('success')
    expect(statusTone('running')).toBe('pending')
    expect(statusTone('failed')).toBe('danger')
    expect(statusTone('review')).toBe('violet')
    expect(statusLabel('review')).toBe('needs review')
    expect(statusLabel('done')).toBe('done')
    expect(resultTone('catch-up')).toBe('success')
    expect(resultTone('skipped')).toBe('neutral')
    expect(resultTone('failed')).toBe('danger')
  })

  it('labels a trigger per kind', () => {
    expect(triggerLabel({ kind: 'github', events: ['issue.opened'], intervalSeconds: 300 })).toBe('on issue.opened · every 5 min')
    expect(triggerLabel({ kind: 'schedule', schedule: { type: 'weekdays', hour: 7, minute: 30 } })).toBe('weekdays at 07:30')
  })
})

describe('automation-format in Polish', () => {
  const tPl = (key: Parameters<typeof resolveMessage>[1], params?: Record<string, string | number>) => resolveMessage('pl', key, params)

  it('names the weekdays, months and relative times in Polish', () => {
    expect(dayName(1, tPl)).toBe('Pn')
    expect(dayTime('2026-09-17T02:00:00Z', WARSAW, tPl)).toBe('Cz 04:00')
    expect(logTime('2026-09-08T02:00:00Z', WARSAW, NOW, tPl)).toBe('8 wrz 04:00')
    expect(relativeIn(NOW + 12 * 60_000, NOW, tPl)).toBe('za 12 min')
    expect(relativeIn(NOW + 3 * 3_600_000, NOW, tPl)).toBe('za 3 godz.')
    expect(agentTime(4 * 3600 + 12 * 60, tPl)).toBe('4 godz. 12 min')
    expect(statusLabel('waiting', tPl)).toBe('czeka na Ciebie')
  })

  it('words every schedule shape', () => {
    expect(scheduleText({ type: 'daily', hour: 4 }, tPl)).toBe('codziennie o 04:00')
    expect(scheduleText({ type: 'weekly', day: 2, hour: 2 }, tPl)).toBe('we wtorki o 02:00')
    expect(scheduleText({ type: 'hours', every: 1 }, tPl)).toBe('co godzinę')
    expect(triggerLabel({ kind: 'github', events: ['issue.opened'], intervalSeconds: 300 }, tPl)).toBe('przy issue.opened · co 5 min')
  })
})

describe('scheduleText', () => {
  const shapes: AutomationSchedule[] = [
    { type: 'daily', hour: 4, minute: 0 },
    { type: 'daily' },
    { type: 'weekdays', hour: 7, minute: 30 },
    { type: 'hours', every: 1 },
    { type: 'hours', every: 6 },
    ...([1, 2, 3, 4, 5, 6, 7] as const).map((day) => ({ type: 'weekly' as const, day, hour: 16, minute: 5 })),
  ]

  it('is English-identical to the contract’s scheduleLabel for every shape', () => {
    for (const shape of shapes) expect(scheduleText(shape), JSON.stringify(shape)).toBe(scheduleLabel(shape))
  })
})
