import { formatLocale } from '@/lib/locale'
import { useSheetState, useSheetPosition, newSheetSelection, useSheetTrigger } from './sheet-state'
import { useDashboardTruth } from '@/api/dashboard-truth'
import { MetricContent, metricSurface, widgetHeading } from './presentation'
import { formatHours as hours } from './format'
import { CircleHelp, Activity, CheckCheck, CircleAlert, ChevronRight } from 'lucide-react'
import { useDashboardLive } from '@/api/dashboard-live'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { DashboardOverview, DashboardOverviewGroup } from '@open-mercato/cezar-api-client'
import { useDashboardOverview } from '@/api/dashboard-overview'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/components/locale-provider'
import { RichText } from '@/components/rich-text'
import { attentionLabel } from '@/i18n/ui-labels'
import { Card } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useProjects } from '@/api/queries'
import { shortAge } from '@/lib/format'
import { deriveAttention } from '@/lib/attention'
import { StatusDot } from '@/components/status-dot'
import { Coverage } from './rows'
import { ExportRows } from './export-rows'
import { useDashboardFilter } from './url-filter'

const LABEL_KEYS = {
  running: 'dashboard.runningNow',
  'needs-you': 'dashboard.needsYou',
  completed: 'dashboard.completed',
  failed: 'dashboard.failedOutcomes',
} as const
const metricTints = {
  'needs-you': 'from-violet/10',
  running: 'from-info/10',
  completed: 'from-success/10',
  failed: 'from-danger/10',
}
const metricIcons = {
  'needs-you': CircleHelp,
  running: Activity,
  completed: CheckCheck,
  failed: CircleAlert,
}
type Selection = {
  identity: number
  snapshot: DashboardOverview
  group: DashboardOverviewGroup
  projectId?: string
}

export function Overview({
  active,
  children,
  onCurrent,
}: {
  active: boolean
  onCurrent?: (group: 'running' | 'needs-you', target: HTMLElement) => void
  children: (modules: { overview?: ReactNode; portfolio?: ReactNode }) => ReactNode
}) {
  const { t, tn } = useLocale()
  const labels = {
    running: t(LABEL_KEYS.running),
    'needs-you': t(LABEL_KEYS['needs-you']),
    completed: t(LABEL_KEYS.completed),
    failed: t(LABEL_KEYS.failed),
  }
  const [period, setPeriod] = useDashboardFilter('period', ['7d', '30d'] as const, '7d')
  const trigger = useSheetTrigger('outcome', '[data-outcome-trigger]')
  const projects = useProjects().data?.projects
  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? id
  const query = useDashboardOverview({ period }, active)
  const [selection, setSelection] = useSheetState<Selection | null>('outcome:selection', null)
  const sheetPosition = useSheetPosition(`outcome:${selection?.identity ?? 'closed'}`)
  const live = useDashboardLive()
  // Leaving the view unmounts the Sheet below without closing it; clear the
  // selection so returning to Overview never reopens it against a stale snapshot.
  useEffect(() => {
    if (!active) setSelection(null)
  }, [active])
  if (!active) return children({})
  const data = query.data
  const open = (group: DashboardOverviewGroup, projectId?: string) => {
    trigger.capture()
    if (data) setSelection({ identity: newSheetSelection(), snapshot: data, group, projectId })
  }
  const complete = data?.coverage.projects.every((p) => p.state === 'complete')
  const overview = (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className={widgetHeading}>{t('dashboard.moduleOverview')}</h2>
        <label className="flex items-center gap-2 text-sm">
          {t('dashboard.outcomesPeriod')}
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value === '30d' ? '30d' : '7d')
              setSelection(null)
            }}
            className="min-h-11 rounded-md border bg-background px-3"
          >
            <option value="7d">{t('dashboard.last7')}</option>
            <option value="30d">{t('dashboard.last30')}</option>
          </select>
        </label>
      </div>
      <div className="space-y-3 p-4">
        {query.isPending && <p role="status">{t('dashboard.loadingOverview')}</p>}
        {query.isError && (
          <p role="alert">
            {data ? t('dashboard.showingPrevious') : ''}{t('dashboard.refreshOverviewFailed')}{' '}
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t('dashboard.retryOverview')}
            </Button>
          </p>
        )}
        {data && (
          <>
            <p className="text-sm">
              {data.metrics.needsYou
                ? tn('dashboard.requireInput', data.metrics.needsYou)
                : complete && live.connected && !query.isError
                  ? t('dashboard.noneRequireInput')
                  : t('dashboard.noWaitingFound')}{' '}
              {tn('dashboard.failedOutcomesCount', data.metrics.failed)}
              {t('dashboard.inThisPeriod')}
            </p>
            <Coverage coverage={data.coverage} retry={() => void query.refetch()} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(['needs-you', 'running', 'completed', 'failed'] as const).map((group) => {
                const value = data.metrics[group === 'needs-you' ? 'needsYou' : group]
                const Icon = metricIcons[group]
                return (
                  <Button
                    key={group}
                    data-outcome-trigger
                    data-export-keep
                    variant="outline"
                    className={`${metricSurface} h-auto min-h-24 flex-col items-start gap-0 whitespace-normal text-left ${group === 'failed' && value === 0 ? 'from-muted/40' : metricTints[group]}`}
                    onClick={(event) => {
                      if (onCurrent && (group === 'running' || group === 'needs-you'))
                        onCurrent(group, event.currentTarget)
                      else open(group)
                    }}
                    aria-label={`${labels[group]}: ${value}`}
                  >
                    <MetricContent
                      label={labels[group]}
                      value={value}
                      icon={<Icon className="size-4" />}
                    >
                      {group === 'running' || group === 'needs-you'
                        ? t('dashboard.currentState')
                        : t('dashboard.lastDays', { days: period === '7d' ? 7 : 30 })}
                    </MetricContent>
                    <span
                      data-export-exclude
                      className="mt-3 flex items-center gap-1 text-xs font-medium"
                    >
                      {t('dashboard.viewTasks')} <ChevronRight className="size-3" aria-hidden="true" />
                    </span>
                  </Button>
                )
              })}
            </div>
            <p className="text-sm">
              {t('dashboard.medianCycle')} <strong>{hours(data.metrics.medianCycleHours)}</strong> ·{' '}
              {t('dashboard.validTimings', { timed: data.metrics.timedTasks, completed: data.metrics.completed })}{' '}
              <Button variant="ghost" onClick={() => open('completed')}>
                {t('dashboard.inspectCompleted')}
              </Button>
            </p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={data.asOf} title={new Date(data.asOf).toLocaleString(formatLocale())}>
                {t('dashboard.updatedAgo', { age: shortAge(data.asOf) })}
              </time>
            </p>
            <details className="text-xs text-muted-foreground">
              <summary data-export-heading="Metric definitions" className="cursor-pointer py-2">
                {t('dashboard.howMetricsWork')}
              </summary>
              <p>
                {t('dashboard.overviewMetricsNote')}
              </p>
            </details>
            <ExportRows
              rows={Object.entries(data.metrics).map(([metric, value]) => ({
                section: 'overview',
                metric,
                value,
                unit: metric === 'medianCycleHours' ? 'hours' : 'tasks',
                asOf: data.asOf,
                note:
                  metric === 'running' || metric === 'needsYou'
                    ? 'Current non-archived state'
                    : `Finished since ${data.windowStart}`,
              }))}
            />
          </>
        )}
      </div>
    </Card>
  )
  const portfolio = data && (
    <div>
      <Card
        className="gap-3 p-4"
        data-export-context={`Outcomes: Last ${period === '7d' ? 7 : 30} calendar days; workload: current state`}
      >
        <h2 className={widgetHeading}>{t('dashboard.modulePortfolio')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('dashboard.projectsIntro')}
        </p>
        <div
          className="overflow-x-auto"
          role="region"
          aria-label={t('dashboard.projectOutcomesAria')}
          tabIndex={0}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(
                  [
                    ['project', t('dashboard.colProject')],
                    ['needsYou', t('dashboard.colNeedsYou')],
                    ['running', t('dashboard.colRunning')],
                    ['completed', t('dashboard.colCompleted')],
                    ['failed', t('dashboard.colFailed')],
                    ['median', t('dashboard.colMedian')],
                  ] as const
                ).map(([id, label]) => (
                  <th
                    key={id}
                    className={`whitespace-nowrap px-3 py-2 font-medium ${id === 'project' ? '' : 'text-right'}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => {
                const source = data.coverage.projects.find(
                  (p) => p.projectId === project.projectId,
                )
                return (
                  <tr key={project.projectId} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        className="font-medium hover:underline"
                        to={`/p/${encodeURIComponent(project.projectId)}/tasks`}
                      >
                        {projectName(project.projectId)}
                      </Link>
                      {source?.state !== 'complete' && (
                        <span className="block text-xs text-muted-foreground">
                          {t('dashboard.incompleteData')}
                        </span>
                      )}
                    </td>
                    {(['needs-you', 'running', 'completed', 'failed'] as const).map((group) => (
                      <td key={group} className="px-3 py-1 text-right">
                        <Button
                          data-export-keep
                          variant="ghost"
                          className="min-h-11 tabular-nums"
                          aria-label={`${projectName(project.projectId)}: ${labels[group]}: ${source?.state === 'unavailable' ? t('dashboard.unavailableCap') : project[group === 'needs-you' ? 'needsYou' : group]}`}
                          disabled={source?.state === 'unavailable'}
                          onClick={() => open(group, project.projectId)}
                        >
                          {source?.state === 'unavailable'
                            ? t('dashboard.unavailableCap')
                            : project[group === 'needs-you' ? 'needsYou' : group]}
                        </Button>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {hours(project.medianCycleHours)}
                      <span className="block text-xs text-muted-foreground">
                        {t('dashboard.timed', { timed: project.timedTasks, completed: project.completed })}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!data.projects.length && <p className="py-4">{t('dashboard.noProjects')}</p>}
        </div>
        <ExportRows
          rows={data.projects.flatMap(({ projectId, ...metrics }) =>
            Object.entries(metrics).map(([metric, value]) => ({
              section: 'portfolio',
              entity: projectId,
              metric,
              value:
                data.coverage.projects.find((p) => p.projectId === projectId)?.state ===
                'unavailable'
                  ? null
                  : value,
              unit: metric === 'medianCycleHours' ? 'hours' : 'tasks',
              asOf: data.asOf,
              note: `Outcomes since ${data.windowStart}; running and needsYou are current state`,
            })),
          )}
        />
      </Card>
    </div>
  )
  return (
    <>
      {children({ overview, portfolio })}
      <Sheet
        open={!!selection}
        onOpenChange={(value) => {
          if (!value) setSelection(null)
        }}
      >
        <SheetContent
          {...sheetPosition}
          className="w-full overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.restore()
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {selection ? labels[selection.group] : t('dashboard.tasks')}
              {selection?.projectId ? ` · ${selection.projectId}` : ''}
            </SheetTitle>
            <SheetDescription>
              {t('dashboard.outcomeSheetDescription')}
            </SheetDescription>
          </SheetHeader>
          {selection && (
            <OutcomeTasks
              key={selection.identity}
              selection={selection}
              projectName={projectName}
              refresh={() => {
                setSelection(null)
                void query.refetch()
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
function OutcomeTasks({
  selection,
  refresh,
  projectName,
}: {
  selection: Selection
  refresh: () => void
  projectName: (id: string) => string
}) {
  const { t } = useLocale()
  const [offset, setOffset] = useSheetState(`outcome:${selection.identity}:offset`, 0)
  const query = useDashboardOverview({
    period: selection.snapshot.period,
    snapshotId: selection.snapshot.snapshotId,
    group: selection.group,
    projectId: selection.projectId,
    offset,
  })
  const summary = useRef<HTMLParagraphElement>(null)
  const pageToFocus = useRef<number | null>(null)
  useEffect(() => {
    if (query.data && pageToFocus.current === offset) {
      summary.current?.focus()
      pageToFocus.current = null
    }
  }, [query.data, offset])
  const goToPage = (next: number) => {
    pageToFocus.current = next
    setOffset(next)
  }
  return (
    <div className="space-y-3 p-4" data-sheet-loading={query.isFetching}>
      {query.isPending && <p>{t('dashboard.loadingTasks')}</p>}
      {query.isError && (
        <p role="alert">
          {t('dashboard.snapshotExpired')}{' '}
          <Button onClick={refresh}>{t('dashboard.refreshOverview')}</Button>
        </p>
      )}
      {query.data && (
        <>
          <p ref={summary} tabIndex={-1} className="text-xs text-muted-foreground">
            <RichText
              text={t('dashboard.snapshotFrom', {
                total: query.data.page.total,
                ago: t('dashboard.ago', { age: shortAge(query.data.asOf) }),
              })}
              tags={{
                time: (ago) => (
                  <time dateTime={query.data!.asOf} title={new Date(query.data!.asOf).toLocaleString(formatLocale())}>
                    {ago}
                  </time>
                ),
              }}
            />
          </p>
          {query.data.page.rows.map((row) => (
            <OutcomeTask key={`${row.projectId}:${row.id}`} row={row} group={selection.group} projectName={projectName} />
          ))}
          {!query.data.page.rows.length && <p>{t('dashboard.noTasksInGroup')}</p>}
        </>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!offset || query.isFetching}
          onClick={() => goToPage(Math.max(0, offset - 20))}
        >
          {t('dashboard.previous')}
        </Button>
        <Button
          variant="outline"
          disabled={!query.data || query.data.page.nextOffset === null || query.isFetching}
          onClick={() => goToPage(query.data!.page.nextOffset!)}
        >
          {t('dashboard.next')}
        </Button>
      </div>
    </div>
  )
}

function OutcomeTask({
  row,
  group,
  projectName,
}: {
  row: DashboardOverview['page']['rows'][number]
  group: DashboardOverviewGroup
  projectName: (id: string) => string
}) {
  const { t } = useLocale()
  const truth = useDashboardTruth(row)
  const current = group === 'running' || group === 'needs-you'
  // Outcomes retain their historical status; operational groups must stop
  // offering stale actions as soon as a live transition arrives.
  if (current && truth) row = { ...row, ...truth }
  const removed = truth === null
  const obsolete = current && (row.archived || (group === 'running'
    ? row.status !== 'running'
    : !['waiting', 'review'].includes(row.status)))
  const inactive = removed || obsolete
  const attention = deriveAttention(row)
  const label = current && removed
    ? t('dashboard.taskRemoved')
    : obsolete
      ? group === 'running' ? t('dashboard.noLongerRunning') : t('dashboard.noLongerNeedsYou')
      : attentionLabel(t, attention.label)
  return (
    <div className="border-b py-3">
      <Link
        aria-disabled={inactive || undefined}
        tabIndex={inactive ? -1 : undefined}
        onClick={(event) => {
          if (inactive) event.preventDefault()
        }}
        className="block min-h-11 font-medium hover:underline"
        to={`/p/${encodeURIComponent(row.projectId)}/tasks/${encodeURIComponent(row.id)}`}
      >
        {row.titleSummary || row.title}
      </Link>
      <p className="text-xs text-muted-foreground">
        <StatusDot tone={attention.tone} /> {projectName(row.projectId)} ·{' '}
        {label} · {row.archived ? t('dashboard.archivedPrefix') : ''}
        <time
          dateTime={row.finishedAt ?? row.createdAt}
          title={new Date(row.finishedAt ?? row.createdAt).toLocaleString(formatLocale())}
        >
          {t(row.finishedAt ? 'dashboard.finishedAgo' : 'dashboard.createdAgo', {
            age: shortAge(row.finishedAt ?? row.createdAt),
          })}
        </time>
      </p>
    </div>
  )
}
