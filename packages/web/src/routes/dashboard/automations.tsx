import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/components/locale-provider'
import { useAutomationsGate } from '@/routes/automations/use-automations'
import { useNow } from '@/lib/use-now'
import { dayTime, relativeIn } from '@/lib/automation-format'
import { enabledAutomations, useDashboardAutomations } from './automations-data'
import { ExportRows } from './export-rows'
import { Freshness } from './presentation'

export function DashboardAutomations() {
  const { t } = useLocale()
  const gate = useAutomationsGate()
  const query = useDashboardAutomations(gate.known && !gate.off)
  const now = useNow(30_000)
  const [all, setAll] = useState(false)
  const rows = enabledAutomations(query.data ?? [])
  const visible = all ? rows : rows.slice(0, 3)
  const errors = query.data?.filter((p) => p.error) ?? []
  const pending =
    !gate.known || (!query.registry.isError && (query.registry.isPending || query.isPending))
  const failed = query.isError || query.registry.isError || errors.length > 0
  return (
    <Card
      data-export-context={`Enabled automations · showing ${visible.length} of ${rows.length} loaded · ${failed ? 'partial coverage' : 'available projects'}`}
      className="min-w-0 gap-0 py-0"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4 text-muted-foreground" />
          {t('dashboard.automations')}
        </h2>
        {!gate.off && query.data && (
          <span className="text-xs text-muted-foreground">
            {t('dashboard.enabledCount', { count: rows.length })}{failed ? t('dashboard.partial') : ''}
          </span>
        )}
      </div>
      {!gate.off && query.data && (
        <>
          <ExportRows
            rows={[
              {
                section: 'automations',
                metric: 'enabled',
                value: rows.length,
                unit: 'automations',
                note: failed ? 'Partial project coverage' : 'Loaded projects',
              },
            ]}
          />
          {query.dataUpdatedAt > 0 && (
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              <Freshness at={new Date(query.dataUpdatedAt).toISOString()} />
            </p>
          )}
        </>
      )}
      {gate.off ? (
        <p className="p-4 text-sm text-muted-foreground">
          {t('dashboard.automationsDisabled')}
        </p>
      ) : (
        <>
          {pending && <p className="p-4 text-sm text-muted-foreground">{t('dashboard.loadingAutomations')}</p>}
          {failed && (
            <div role="alert" className="p-4 text-sm">
              <p>{t('dashboard.automationsRefreshFailed')}</p>
              {errors.map((p) => (
                <p key={p.id}>
                  {p.name}: {p.error}
                </p>
              ))}
              <Button variant="ghost" onClick={query.retry}>
                {t('dashboard.retryAutomations')}
              </Button>
            </div>
          )}
          {!pending && !failed && rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {t('dashboard.noEnabled')}
            </p>
          )}
          {visible.map(({ project, automation: a, at }) => {
            const warning =
              (a.state?.consecutiveFailures ?? 0) > 0 ? t('dashboard.recentChecksFailed') : undefined
            const timing =
              at === null
                ? t('dashboard.nextTimeUnavailable')
                : at <= now
                  ? t('dashboard.dueAwaiting')
                  : relativeIn(at, now, t)
            const action = a.kind !== 'schedule' ? t('dashboard.nextCheck') : t('dashboard.nextRun')
            return (
              <div
                key={`${project.id}:${a.id}`}
                data-export-row
                className="border-b px-4 py-3 last:border-0"
              >
                <Link
                  className="block min-h-11 text-sm font-medium hover:underline"
                  to={`/p/${encodeURIComponent(project.id)}/automations/${encodeURIComponent(a.id)}`}
                >
                  {a.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.nextLine', { project: project.name, action, timing })}
                </p>
                {at !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={new Date(at).toISOString()}>
                      {dayTime(at, project.data!.timeZone, t)} · {project.data!.timeZone}
                    </time>
                  </p>
                )}
                {a.kind !== 'schedule' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('dashboard.checksEvents')}
                  </p>
                )}
                {warning && <p className="mt-1 text-xs text-warning">{warning}</p>}
                <ExportRows
                  rows={[
                    {
                      section: 'automation',
                      entity: `${project.id}:${a.id}`,
                      metric: 'name',
                      value: a.name,
                    },
                    {
                      section: 'automation',
                      entity: `${project.id}:${a.id}`,
                      metric: a.kind !== 'schedule' ? 'nextCheckAt' : 'nextRunAt',
                      value: at === null ? null : new Date(at).toISOString(),
                      note: [timing, warning].filter(Boolean).join(' · '),
                    },
                  ]}
                />
              </div>
            )
          })}
          {rows.length > 3 && (
            <Button variant="ghost" className="m-2 min-h-11" onClick={() => setAll(!all)}>
              {all ? t('dashboard.showFewer') : t('dashboard.showAllEnabled', { count: rows.length })}
            </Button>
          )}
          {!pending && (
            <details className="border-t px-4 py-2 text-xs text-muted-foreground">
              <summary
                className="min-h-11 cursor-pointer py-3"
                data-export-heading="Project automations"
              >
                {t('dashboard.manageByProject')}
              </summary>
              {query.data?.map((p) => (
                <Link
                  key={p.id}
                  className="block min-h-11 py-3 hover:underline"
                  to={`/p/${encodeURIComponent(p.id)}/automations`}
                >
                  {p.name}
                </Link>
              ))}
            </details>
          )}
        </>
      )}
    </Card>
  )
}
