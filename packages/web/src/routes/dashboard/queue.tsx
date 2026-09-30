import { useDashboardLive } from '@/api/dashboard-live'
import { useRef } from 'react'
import type { DashboardSnapshot } from '@open-mercato/cezar-api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLocale } from '@/components/locale-provider'
import { useDashboardPage, useDisplacedRows } from './pages'
import { TaskRow, taskKey } from './rows'
import { useStagedRows } from './state'
export function Queue({
  snapshot,
  questions,
  reviews,
  more,
  healthy = true,
}: {
  healthy?: boolean
  snapshot: DashboardSnapshot
  questions: number
  reviews: number
  more: (group: 'questions' | 'reviews', count: number) => void
}) {
  const { t } = useLocale()
  const live = useDashboardLive()
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <div className="border-b p-4">
        <h2 id="dashboard-needs-you" tabIndex={-1} className="text-sm font-semibold">
          {t('dashboard.needsYouCount', { count: snapshot.counts.questions + snapshot.counts.reviews })}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('dashboard.questionsReviews', { questions: snapshot.counts.questions, reviews: snapshot.counts.reviews })}
        </p>
      </div>
      {healthy &&
      live.connected &&
      snapshot.counts.questions + snapshot.counts.reviews === 0 &&
      snapshot.coverage.projects.every((p) => p.state === 'complete') ? (
        <p className="p-6 text-sm">{t('dashboard.allCaughtUp')}</p>
      ) : null}
      <QueueSection snapshot={snapshot} group="questions" count={questions} more={more} />
      <QueueSection snapshot={snapshot} group="reviews" count={reviews} more={more} />
    </Card>
  )
}
function QueueSection({
  snapshot,
  group,
  count,
  more,
}: {
  snapshot: DashboardSnapshot
  group: 'questions' | 'reviews'
  count: number
  more: (group: 'questions' | 'reviews', count: number) => void
}) {
  const { t, tn } = useLocale()
  const initial = snapshot[group]
  const wanted = Math.max(count, initial.rows.length)
  const query = useDashboardPage(snapshot, group, wanted, wanted > initial.rows.length)
  const current = wanted > initial.rows.length ? query.data : initial.rows
  const staged = useStagedRows(current, taskKey, group, count)
  const displaced = useDisplacedRows(
    snapshot,
    group,
    wanted,
    staged.rows.filter((r) => r.removed).map((r) => r.row),
  )
  const heading = useRef<HTMLHeadingElement>(null)
  if (!initial.total && !staged.rows.length) return null
  return (
    <section>
      <h3
        ref={heading}
        tabIndex={-1}
        className="bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wide"
      >
        {group === 'questions' ? t('dashboard.questions') : t('dashboard.reviews')} · {initial.total}
      </h3>
      {staged.updates > 0 && (
        <Button
          variant="ghost"
          className="m-2 min-h-11"
          onClick={() => {
            staged.show()
            heading.current?.focus()
          }}
        >
          {tn('dashboard.updatesShow', staged.updates)}
        </Button>
      )}
      {staged.rows.map(({ row, removed }) => (
        <TaskRow
          key={taskKey(row)}
          row={displaced.data?.get(taskKey(row)) ?? row}
          removed={removed && !!displaced.data && !displaced.data.has(taskKey(row))}
          checking={current === undefined || (removed && !displaced.data)}
          checkFailed={
            (current === undefined && query.isError) ||
            (removed && !displaced.data && displaced.isError)
          }
          queue
        />
      ))}
      {(query.isError || displaced.isError) && (
        <p role="alert" className="p-4 text-sm">
          {t('dashboard.checkStateFailed')}{' '}
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              void query.refetch()
              void displaced.refetch()
            }}
          >
            {t('dashboard.retry')}
          </Button>
        </p>
      )}
      {wanted < initial.total && (
        <Button
          variant="ghost"
          className="m-2 min-h-11"
          disabled={query.isFetching}
          onClick={() => more(group, wanted + Math.min(20, initial.total - wanted))}
        >
          {tn(group === 'questions' ? 'dashboard.showMoreQuestions' : 'dashboard.showMoreReviews', Math.min(20, initial.total - wanted))}
        </Button>
      )}
    </section>
  )
}
