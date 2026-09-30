import { useSheetState, useSheetPosition, newSheetSelection, useSheetTrigger } from './sheet-state'
import { Freshness } from './presentation'
import { useDashboardFilter } from './url-filter'
import { formatAmount } from './format'
import { useState } from 'react'
import { Link } from 'react-router'
import type { DashboardCosts, DashboardCostTask } from '@open-mercato/cezar-api-client'
import { useDashboardCosts, useCostTasks, useDashboardCostPolicy } from '@/api/dashboard-costs'
import { useDashboardTruth } from '@/api/dashboard-truth'
import { useHealth } from '@/api/queries'
import { usageMetricVisibility, type UsageMetricVisibility } from '@/lib/token-metrics'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/components/locale-provider'
import { runStatusLabel } from '@/i18n/ui-labels'
import { Card } from '@/components/ui/card'
import { deriveAttention } from '@/lib/attention'
import { StatusDot } from '@/components/status-dot'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Coverage } from './rows'
import { ExportRows } from './export-rows'
import { CostMetricCard, CostProjectBars } from './cost-visuals'
const fields = {
  cost: 'costUsd',
  input: 'inputTokens',
  output: 'outputTokens',
} as const
const LABEL_KEYS = {
  cost: 'dashboard.reportedUsd',
  input: 'dashboard.inputTokens',
  output: 'dashboard.outputTokens',
} as const
type Sort = DashboardCosts['sort']
function contentChanged(a: DashboardCosts, b: DashboardCosts) {
  return (
    JSON.stringify([a.totals, a.projects, a.tasks, a.visibility, a.coverage, a.invalidDateTasks]) !==
    JSON.stringify([b.totals, b.projects, b.tasks, b.visibility, b.coverage, b.invalidDateTasks])
  )
}
const format = (value: number | null | undefined, sort: Sort) =>
  formatAmount(value, sort === 'cost')

function choices(visibility: UsageMetricVisibility): Sort[] {
  return [
    ...(visibility.cost ? ['cost' as const] : []),
    ...(visibility.tokens ? ['input' as const, 'output' as const] : []),
  ]
}
function SortSelect({
  value,
  onChange,
  visibility,
}: {
  value: Sort
  onChange: (value: Sort) => void
  visibility: UsageMetricVisibility
}) {
  const { t } = useLocale()
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      {t('dashboard.sortBy')}
      <select
        className="min-h-11 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as Sort)}
      >
        {choices(visibility).map((sort) => (
          <option key={sort} value={sort}>
            {t(LABEL_KEYS[sort])}
          </option>
        ))}
      </select>
    </label>
  )
}
export function DashboardUsageCosts() {
  const visibility = usageMetricVisibility(useHealth().data)
  return <UsageCosts visibility={visibility} />
}
export function UsageCosts({ visibility }: { visibility: UsageMetricVisibility }) {
  const { t } = useLocale()
  return (
    <Card className="gap-0 py-0">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('dashboard.moduleUsage')}</h2>
      </div>
      {!visibility.cost && !visibility.tokens ? (
        <p className="p-4 text-sm">{t('dashboard.usageHidden')}</p>
      ) : (
        <CostContent key={`${visibility.cost}:${visibility.tokens}`} visibility={visibility} />
      )}
    </Card>
  )
}
function CostContent({ visibility }: { visibility: UsageMetricVisibility }) {
  const [period, setPeriod] = useDashboardFilter(
    'usagePeriod',
    ['all', '7d', '30d'] as const,
    'all',
  )
  const [sort, setSort] = useDashboardFilter(
    'usageSort',
    choices(visibility),
    visibility.cost ? 'cost' : 'input',
  )
  return (
    <CostPeriod
      period={period}
      setPeriod={setPeriod}
      sort={sort}
      setSort={setSort}
      visibility={visibility}
    />
  )
}
function CostPeriod({
  period,
  setPeriod,
  sort,
  setSort,
  visibility,
}: {
  period: DashboardCosts['period']
  setPeriod: (p: DashboardCosts['period']) => void
  sort: Sort
  setSort: (s: Sort) => void
  visibility: UsageMetricVisibility
}) {
  const { t } = useLocale()
  const query = useDashboardCosts(period, sort, `${visibility.cost}:${visibility.tokens}`)
  const [accepted, setAccepted] = useSheetState<DashboardCosts | undefined>('usage:accepted', undefined)
  const data = accepted ?? query.data
  const latest = query.data ?? data
  const [panel, setPanel] = useSheetState<{ identity: number; projectId: string; snapshot: DashboardCosts; latestId: string } | null>('usage:panel', null)
  const [observedPeriod, setObservedPeriod] = useState(period)
  // Reset the cohort without remounting the controls and losing keyboard focus.
  if (observedPeriod !== period) {
    setObservedPeriod(period)
    setAccepted(undefined)
    setPanel(null)
  }
  const sheetPosition = useSheetPosition(`usage:${panel?.identity ?? 'closed'}`)
  const trigger = useSheetTrigger('usage', '[data-usage-trigger]')
  const openPanel = (projectId: string) => {
    trigger.capture()
    if (data) setPanel({ identity: newSheetSelection(), projectId, snapshot: data, latestId: latest?.snapshotId ?? data.snapshotId })
  }
  const currentPolicy = useDashboardCostPolicy() ?? visibility
  const policy = {
    cost: visibility.cost && currentPolicy.cost,
    tokens: visibility.tokens && currentPolicy.tokens,
  }
  const effectiveSort = choices(policy).includes(sort) ? sort : (choices(policy)[0] ?? 'cost')
  const projects = [...(data?.projects ?? [])].sort((a, b) => {
    const av = a[fields[effectiveSort]]?.value
    const bv = b[fields[effectiveSort]]?.value
    return (
      (av == null ? (bv == null ? 0 : 1) : bv == null ? -1 : bv - av) ||
      a.projectId.localeCompare(b.projectId)
    )
  })
  // Latch the first completed response; subsequent refreshes become an explicit candidate.
  if (!accepted && query.data) setAccepted(query.data)
  const changed = data && latest && contentChanged(data, latest)
  const partial = data?.coverage.projects.some((p) => p.state !== 'complete')
  const currentPartial = latest?.coverage.projects.some((p) => p.state !== 'complete')
  const coverageChanged = JSON.stringify(data?.coverage) !== JSON.stringify(latest?.coverage)
  const empty = data?.totals.tasks === 0 && !partial && !currentPartial
  return (
    <div className="space-y-4 p-4 text-sm">
      {data && (
        <ExportRows
          rows={
            empty
              ? []
              : [
                  ...choices(policy).map((metric) => ({
                    section: 'totals',
                    metric: fields[metric],
                    value: data.totals[fields[metric]]?.value ?? null,
                    unit: metric === 'cost' ? 'USD' : 'tokens',
                    reportedTasks: data.totals[fields[metric]]?.reportedTasks ?? 0,
                    totalTasks: data.totals.tasks,
                    asOf: data.asOf,
                  })),
                  ...(policy.cost || policy.tokens ? projects.slice(0, 5) : []).map((project) => ({
                    section: 'project',
                    entity: project.projectId,
                    metric: fields[effectiveSort],
                    value: project[fields[effectiveSort]]?.value ?? null,
                    unit: effectiveSort === 'cost' ? 'USD' : 'tokens',
                    reportedTasks: project[fields[effectiveSort]]?.reportedTasks ?? 0,
                    totalTasks: project.tasks,
                    asOf: data.asOf,
                  })),
                ]
          }
        />
      )}

      {data && (
        <p className="text-xs text-muted-foreground">
          <Freshness at={data.asOf} />
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{t('dashboard.lifetimeTotals')}</h3>
          <details className="mt-1 text-xs text-muted-foreground">
            <summary
              data-export-heading="Metric definitions"
              className="min-h-11 cursor-pointer py-3"
            >
              {t('dashboard.howMetricsWork')}
            </summary>
            <p>
              {t('dashboard.usageNote', { invoice: policy.cost ? t('dashboard.notInvoice') : '' })}
            </p>
          </details>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          {t('dashboard.tasksCreated')}
          <select
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as DashboardCosts['period'])}
          >
            <option value="all">{t('dashboard.allTime')}</option>
            <option value="7d">{t('dashboard.last7')}</option>
            <option value="30d">{t('dashboard.last30')}</option>
          </select>
        </label>
      </div>
      {period !== 'all' && (
        <p className="text-muted-foreground">
          {t('dashboard.lifetimeOfCreated')}
        </p>
      )}
      {query.isPending && <p>{t('dashboard.loadingUsage')}</p>}
      {query.isError && (
        <p role="alert">
          {data ? t('dashboard.staleUsage') : t('dashboard.loadUsageFailed')}{' '}
          <Button className="min-h-11" onClick={() => void query.refetch()}>
            {t('dashboard.retry')}
          </Button>
        </p>
      )}
      {changed && (
        <p role="status">
          {t('dashboard.newerUsage')}
        </p>
      )}
      {changed && (
        <Button className="min-h-11" variant="outline" onClick={() => setAccepted(latest)}>
          {t('dashboard.updatesAvailableShow')}
        </Button>
      )}
      {data && partial && (
        <div>
          <p className="text-muted-foreground">{t('dashboard.coverageDisplayedUsage')}</p>
          <Coverage coverage={data.coverage} retry={() => void query.refetch()} />
        </div>
      )}
      {latest && currentPartial && coverageChanged && (
        <div>
          <p className="text-muted-foreground">{t('dashboard.currentAvailability')}</p>
          <Coverage coverage={latest.coverage} retry={() => void query.refetch()} />
        </div>
      )}
      {data && (
        <>
          {!empty && (
            <div className="report-cost-metrics grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
              {choices(policy).map((metric) => (
                <CostMetricCard
                  key={metric}
                  metric={metric}
                  label={t(LABEL_KEYS[metric])}
                  value={format(data.totals[fields[metric]]?.value, metric)}
                  reported={data.totals[fields[metric]]?.reportedTasks ?? 0}
                  total={data.totals.tasks}
                />
              ))}
            </div>
          )}
          {!policy.cost && !policy.tokens && (
            <p>{t('dashboard.usageHidden')}</p>
          )}
          {data.totals.tasks === 0 ? (
            <p>
              {partial || currentPartial
                ? t('dashboard.noRetainedRead')
                : t('dashboard.noRetainedCohort')}
            </p>
          ) : (
            choices(policy).every((metric) => !data.totals[fields[metric]]?.reportedTasks) && (
              <p>{t('dashboard.noReportsVisible')}</p>
            )
          )}
          {empty && (
            <p className="text-muted-foreground">{t('dashboard.usageAppears')}</p>
          )}
          <p className="text-muted-foreground">
            {t('dashboard.deletedExcluded')}
            {data.invalidDateTasks
              ? t('dashboard.invalidDates', {
                  count: data.invalidDateTasks,
                  scope: period === 'all' ? t('dashboard.includedAllTime') : t('dashboard.excludedPeriod'),
                })
              : ''}
          </p>
          {!empty && (policy.cost || policy.tokens) && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">{t('dashboard.topProjects')}</h3>
                  <p className="text-muted-foreground">{t('dashboard.rankingNote')}</p>
                </div>
                <SortSelect value={effectiveSort} onChange={setSort} visibility={policy} />
              </div>
              <CostProjectBars
                projects={projects}
                metric={effectiveSort}
                label={t(LABEL_KEYS[effectiveSort])}
                field={fields[effectiveSort]}
                format={(value) => format(value, effectiveSort)}
                currentProjects={latest?.projects ?? []}
                onSelect={openPanel}
              />
              <Button data-usage-trigger className="min-h-11" variant="outline" onClick={() => openPanel('')}>
                {t('dashboard.viewTasks')}
              </Button>
            </>
          )}
        </>
      )}
      <Sheet
        open={panel !== null && (policy.cost || policy.tokens)}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
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
            <SheetTitle>{panel?.projectId ? t('dashboard.projectTasks', { project: panel.projectId }) : t('dashboard.allTasks')}</SheetTitle>
            <SheetDescription>
              {t('dashboard.costSheetDescription')}
            </SheetDescription>
          </SheetHeader>
          {panel !== null && (
            <CostTasks
              key={panel.identity}
              identity={`usage:${panel.identity}`}
              // Open the displayed cohort. Only refreshes arriving after opening
              // become candidates for the Sheet's own explicit update control.
              snapshot={latest && latest.snapshotId !== panel.latestId ? latest : panel.snapshot}
              projectId={panel.projectId || undefined}
              visibility={policy}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
function CostTasks({
  identity,
  snapshot,
  projectId,
  visibility,
}: {
  identity: string
  snapshot: DashboardCosts
  projectId?: string
  visibility: UsageMetricVisibility
}) {
  const [sort, setSort] = useSheetState<Sort>(`${identity}:sort`, snapshot.sort)
  const effective = choices(visibility).includes(sort)
    ? sort
    : (choices(visibility)[0] ?? 'cost')
  return (
    <CostTaskPage
      identity={identity}
      snapshot={snapshot}
      projectId={projectId}
      visibility={visibility}
      sort={effective}
      setSort={setSort}
    />
  )
}
function CostTaskPage({
  identity,
  snapshot,
  projectId,
  visibility,
  sort,
  setSort,
}: {
  identity: string
  snapshot: DashboardCosts
  projectId?: string
  visibility: UsageMetricVisibility
  sort: Sort
  setSort: (s: Sort) => void
}) {
  const { t } = useLocale()
  const [count, setCount] = useSheetState(`${identity}:count`, 20)
  const [pagingSnapshot, setPagingSnapshot] = useSheetState<DashboardCosts | undefined>(`${identity}:paging`, undefined)
  const [observedSnapshot, setObservedSnapshot] = useState(snapshot.snapshotId)
  if (observedSnapshot !== snapshot.snapshotId) {
    setObservedSnapshot(snapshot.snapshotId)
    setPagingSnapshot(undefined)
  }
  const query = useCostTasks(pagingSnapshot ?? snapshot, projectId, sort, count)
  const currentPolicy = useDashboardCostPolicy() ?? visibility
  const policy = {
    cost: visibility.cost && currentPolicy.cost,
    tokens: visibility.tokens && currentPolicy.tokens,
  }
  const effectiveSort = choices(policy).includes(sort) ? sort : (choices(policy)[0] ?? 'cost')
  const [accepted, setAccepted] = useSheetState<typeof query.data>(`${identity}:accepted`, undefined)
  const [acceptedCount, setAcceptedCount] = useSheetState(`${identity}:acceptedCount`, count)
  const [acceptedSort, setAcceptedSort] = useSheetState(`${identity}:acceptedSort`, sort)
  const [observedSort, setObservedSort] = useState(sort)
  if (observedSort !== sort) {
    setObservedSort(sort)
    setCount(20)
    // Sorting changes presentation, never acceptance of a fresher cohort.
    setPagingSnapshot(accepted ?? pagingSnapshot ?? snapshot)
  }
  if (
    query.data &&
    (!accepted || ((acceptedCount !== count || acceptedSort !== sort) && accepted.snapshotId === query.data.snapshotId))
  ) {
    setAccepted(query.data)
    setAcceptedCount(count)
    setAcceptedSort(sort)
  }
  const data = accepted ?? query.data
  const changed = query.data && data && contentChanged(query.data, data)
  const partial = data?.coverage.projects.some((p) => p.state !== 'complete')
  const currentPartial = query.data?.coverage.projects.some((p) => p.state !== 'complete')
  const coverageChanged = JSON.stringify(data?.coverage) !== JSON.stringify(query.data?.coverage)
  const validProject = !projectId || snapshot.projects.some((p) => p.projectId === projectId)
  return (
    <div className="space-y-3 p-4 text-sm" data-sheet-loading={query.isFetching}>
      <SortSelect value={effectiveSort} onChange={setSort} visibility={policy} />
      {query.isPending && <p>{t('dashboard.loadingTasks')}</p>}
      {query.isError && (
        <p role="alert">
          {t('dashboard.refreshTasksFailed')}{data ? t('dashboard.staleUsageShort') : ''}{' '}
          <Button className="min-h-11" onClick={() => void query.refetch()}>
            {t('dashboard.retry')}
          </Button>
        </p>
      )}
      {changed && (
        <Button
          className="min-h-11"
          onClick={() => {
            setAccepted(query.data)
            setAcceptedCount(count)
            setAcceptedSort(sort)
          }}
        >
          {t('dashboard.updatesAvailableShow')}
        </Button>
      )}
      {data && partial && (
        <div>
          <p className="text-muted-foreground">{t('dashboard.coverageDisplayedTasks')}</p>
          <Coverage coverage={data.coverage} retry={() => void query.refetch()} />
        </div>
      )}
      {query.data && currentPartial && coverageChanged && (
        <div>
          <p className="text-muted-foreground">{t('dashboard.currentAvailability')}</p>
          <Coverage coverage={query.data.coverage} retry={() => void query.refetch()} />
        </div>
      )}
      {data && (
        <>
          <p>
            {t('dashboard.tasksOfRetained', { shown: data.tasks.rows.length, total: data.tasks.total })}
          </p>
          {data.tasks.total === 0 && (
            <p>
              {data.coverage.projects.some((p) => p.state !== 'complete')
                ? t('dashboard.noTasksRead')
                : t('dashboard.noRetainedCohort')}
            </p>
          )}
          {data.tasks.rows.map((row) => (
            <CostTaskRow
              key={`${row.projectId}:${row.id}`}
              row={row}
              visibility={policy}
              disabled={
                !validProject ||
                !query.data ||
                !!(
                  changed &&
                  !query.data?.tasks.rows.some(
                    (item) => item.id === row.id && item.projectId === row.projectId,
                  )
                )
              }
            />
          ))}
          {data.tasks.nextOffset !== null && (
            <Button
              className="min-h-11"
              disabled={query.isFetching}
              onClick={() => {
                setPagingSnapshot(data)
                setCount((n) => n + 20)
              }}
            >
              {t('dashboard.show20More')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
function CostTaskRow({
  row,
  visibility,
  disabled,
}: {
  row: DashboardCostTask
  visibility: UsageMetricVisibility
  disabled: boolean
}) {
  const { t } = useLocale()
  const truth = useDashboardTruth(row)
  disabled = disabled || truth === null
  const attention = deriveAttention({ status: truth?.status ?? row.status })
  return (
    <div className="border-b py-3">
      <div className="flex items-center gap-2">
        <StatusDot tone={attention.tone} pulse={attention.pulse} />
        <Link
          className="flex min-h-11 items-center break-words font-medium hover:underline"
          to={`/p/${encodeURIComponent(row.projectId)}/tasks/${encodeURIComponent(row.id)}`}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          onClick={(e) => {
            if (disabled) e.preventDefault()
          }}
        >
          {row.title}
        </Link>
      </div>
      <p className="text-muted-foreground">
        {row.projectId} · {disabled ? t('dashboard.checking') : runStatusLabel(t, truth?.status ?? row.status)}
        {row.archived ? t('dashboard.archived') : ''}
        {row.subtask ? ` · ${t('dashboard.subtask')}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
        {choices(visibility).map((metric) => (
          <span key={metric}>
            {t(LABEL_KEYS[metric])}: {format(row[fields[metric]], metric)}
          </span>
        ))}
      </div>
    </div>
  )
}
