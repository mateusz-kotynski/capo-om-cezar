import { ExportRows } from './export-rows'
import { useContext, useLayoutEffect, useMemo, useRef } from 'react'
import type { DashboardFeed, DashboardFeedRow } from '@open-mercato/cezar-api-client'
import { useDashboardFeed } from '@/api/dashboard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SegmentedControl } from '@/components/facet-filter'
import { useLocale, type TFn } from '@/components/locale-provider'
import { shortAge } from '@/lib/format'
import { formatLocale } from '@/lib/locale'
import { TaskRow, Coverage } from './rows'
import { DashboardEntryContext, readPanel, savePanel, useStagedRows } from './state'
function sourceLabel(key: string, t: TFn) {
  if (!key.startsWith('github:')) return key === 'tasks' ? t('dashboard.sourceTasks') : key
  const parts = key.slice(7).split(':')
  const kind = parts.pop() === 'pr' ? t('dashboard.sourcePullRequests') : t('dashboard.sourceIssues')
  const name = parts
    .join(':')
    .replace(/^project:/, t('dashboard.sourceProject'))
    .replace(/^github.com\//, '')
  return `${name} · ${kind}`
}
const feedKey = (row: DashboardFeedRow) => row.key
export function Feed({
  filter,
  setFilter,
  count,
  more,
}: {
  filter: DashboardFeed['filter']
  setFilter: (value: DashboardFeed['filter']) => void
  count: number
  more: () => void
}) {
  const { t, tn } = useLocale()
  const query = useDashboardFeed(filter, true)
  const staged = useStagedRows(
    query.data?.rows, feedKey, `feed:${filter}`, 0,
    (row) => row.kind === 'task-result',
  )
  // Detached GitHub rows disappear immediately; task results retain reconciliation labels.
  const rows = staged.rows
  const updates = staged.updates
  const entry = useContext(DashboardEntryContext)
  const list = useRef<HTMLDivElement>(null)
  const scrollKey = `feed:${filter}`
  const restore = useMemo(() => ({
    scroll: readPanel(entry, scrollKey)?.scroll ?? 0,
    done: false,
  }), [entry, scrollKey])
  useLayoutEffect(() => {
    if (!list.current || restore.done) return
    list.current.scrollTop = restore.scroll
    // Cached rows may arrive after mounting; retry once the list can reach its position.
    restore.done = Math.abs(list.current.scrollTop - restore.scroll) < 1 ||
      (!!query.data && !query.isPending && !query.isFetching)
  }, [restore, rows.length, count, query.data, query.isPending, query.isFetching])
  const heading = useRef<HTMLHeadingElement>(null)
  const github = query.data?.sources.filter((s) => s.key.startsWith('github:')) ?? []
  const fetched = github.flatMap((s) => (s.fetchedAt ? [s.fetchedAt] : [])).sort()[0]
  const githubFailed = query.githubError
  const unconfigured = github.filter((s) => s.reason === 'No GitHub remote')
  const loading = github.some((s) => s.reason === 'Still loading GitHub')
  const noGithub = github.length > 0 && unconfigured.length === github.length && !githubFailed
  const errors = github.filter(
    (s) =>
      s.state !== 'ready' &&
      s.reason !== 'No GitHub remote' &&
      s.reason !== 'Still loading GitHub',
  )
  const tasksOnly = noGithub && filter === 'all'
  return (
    <Card
      data-export-context={`Results source: ${filter}; Last 7 days; loaded ${Math.min(count, rows.length)} rows`}
      className="min-w-0 gap-0 overflow-hidden py-0"
    >
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold">
            {tasksOnly ? t('dashboard.recentResults') : t('dashboard.recentResultsGithub')}
          </h2>
          <span className="text-xs text-muted-foreground">{t('dashboard.last7Days')}</span>
        </div>
        {!tasksOnly && (
          <SegmentedControl
            slot="dashboard-feed"
            label={t('dashboard.resultsSource')}
            value={filter}
            options={[
              { value: 'all', label: t('dashboard.filterAll') },
              { value: 'tasks', label: t('dashboard.filterTasks') },
              { value: 'github', label: t('dashboard.filterGithub') },
            ]}
            onChange={setFilter}
          />
        )}
        {tasksOnly && (
          <p className="text-xs text-muted-foreground">
            {t('dashboard.taskResultsNoGithub')}
          </p>
        )}
        {filter !== 'tasks' && !tasksOnly && (
          <details
            className="text-xs text-muted-foreground"
            open={errors.length || githubFailed ? true : undefined}
          >
            <summary className="cursor-pointer py-2">
              {errors.length || githubFailed
                ? t('dashboard.githubNeedsAttention')
                : loading
                  ? t('dashboard.githubChecking')
                  : noGithub
                    ? t('dashboard.githubNotConfigured')
                    : fetched
                      ? t('dashboard.githubCheckedAgo', { age: shortAge(fetched) })
                      : t('dashboard.githubSource')}
            </summary>
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <p>
                {errors.length || githubFailed
                  ? fetched
                    ? t('dashboard.githubRefreshFailedAt', {
                        time: new Date(fetched).toLocaleTimeString(formatLocale() ?? [], { hour: '2-digit', minute: '2-digit' }),
                      })
                    : t('dashboard.githubLoadFailed')
                  : loading
                    ? t('dashboard.githubCheckingSources')
                    : noGithub
                      ? t('dashboard.githubNoReposSelectTasks')
                      : fetched
                        ? t('dashboard.githubCheckedAgo', { age: shortAge(fetched) })
                        : t('dashboard.githubSnapshot')}
              </p>
              {!noGithub && (
                <Button
                  variant="ghost"
                  className="min-h-11 px-0"
                  disabled={query.githubFetching}
                  onClick={() => {
                    void query.refetch()
                  }}
                >
                  {query.githubFetching
                    ? t('dashboard.refreshing')
                    : errors.length || githubFailed
                      ? t('dashboard.retryGithub')
                      : t('dashboard.refreshGithub')}
                </Button>
              )}
            </div>
          </details>
        )}
      </div>
      <div
        role="region"
        aria-label={t('dashboard.resultsListAria')}
        ref={list}
        onWheel={() => { restore.done = true }}
        onTouchStart={() => { restore.done = true }}
        onKeyDown={() => { restore.done = true }}
        onScroll={(event) => {
          if (entry && restore.done)
            savePanel(entry, scrollKey, { count, scroll: event.currentTarget.scrollTop })
        }}
        tabIndex={0}
        className="max-h-80 overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {query.isError && (
          <p role="alert" className="p-4 text-sm">
            {t('dashboard.loadResultsFailed')}{' '}
            <Button
              className="min-h-11"
              onClick={() => {
                void query.retryFailed()
              }}
            >
              {t('dashboard.retry')}
            </Button>
          </p>
        )}
        {query.isPending && <p className="p-4 text-sm">{t('dashboard.loadingResults')}</p>}
        {updates > 0 && (
          <Button
            variant="ghost"
            className="m-2 min-h-11"
            onClick={() => {
              staged.show()
              heading.current?.focus()
            }}
          >
            {tn('dashboard.updatesShow', updates)}
          </Button>
        )}
        {rows.slice(0, count).map(({ row, removed }) =>
          row.kind === 'task-result' ? (
            <div key={row.key}>
              <p className="px-4 pt-3 text-xs text-muted-foreground">
                {removed
                  ? t('dashboard.outsideCurrent')
                  : t('dashboard.latestResult', {
                      status: row.run.status === 'failed' ? t('dashboard.statusFailed') : t('dashboard.statusCompleted'),
                    })}
              </p>
              <TaskRow row={row.run} />
            </div>
          ) : (
            <div key={row.key} className="border-b p-4">
              <ExportRows
                rows={[
                  {
                    section: 'github',
                    entity: `${row.repo}#${row.number}`,
                    metric: row.itemKind,
                    value: row.title,
                    asOf: row.at,
                    note: row.url,
                  },
                ]}
              />
              <a
                className="block min-h-11 break-words text-sm font-medium hover:underline"
                href={row.url}
                target="_blank"
                rel="noreferrer"
              >
                {row.title}
              </a>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.createdItem', {
                  repo: row.repo,
                  kind: row.itemKind === 'pr' ? t('dashboard.pullRequestShort') : t('dashboard.issueShort'),
                  number: row.number,
                  age: shortAge(row.at),
                })}
              </p>
            </div>
          ),
        )}
        {query.data &&
          !query.data.rows.length &&
          !rows.length &&
          !query.isFetching &&
          !query.isError &&
          !errors.length &&
          !loading &&
          query.data.coverage.projects.every((p) => p.state === 'complete') && (
            <p className="p-6 text-sm">{t('dashboard.noResults')}</p>
          )}
        {count < rows.length && (
          <Button variant="ghost" className="m-2 min-h-11" onClick={more}>
            {tn('dashboard.showMoreResults', Math.min(20, rows.length - count))}
          </Button>
        )}
        {query.data?.truncated && <p className="p-4 text-xs">{t('dashboard.latest60')}</p>}
        {query.data && (
          <Coverage
            coverage={query.data.coverage}
            retry={() => {
              void query.retryTasks()
            }}
          />
        )}
        {!tasksOnly && query.data?.sources.some((s) => s.state !== 'ready' || s.truncated) && (
          <details className="p-4 text-xs">
            <summary className="min-h-11 cursor-pointer py-2">{t('dashboard.sourceDetails')}</summary>
            {query.data.sources.map((s) => (
              <p className="break-words py-1" key={s.key}>
                {sourceLabel(s.key, t)}:{' '}
                {s.reason === 'No GitHub remote'
                  ? t('dashboard.notConfigured')
                  : s.reason === 'Still loading GitHub'
                    ? t('dashboard.checkingShort')
                    : (s.reason ?? (s.state === 'ready' ? t('dashboard.upToDate') : s.state))}
                {s.truncated ? t('dashboard.capped') : ''}
                {s.fetchedAt ? t('dashboard.checkedAgo', { age: shortAge(s.fetchedAt) }) : ''}
              </p>
            ))}
          </details>
        )}
      </div>
    </Card>
  )
}
