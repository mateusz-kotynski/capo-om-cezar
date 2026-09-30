import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { AlertTriangleIcon, ArrowLeftIcon, CircleDotIcon, ExternalLinkIcon, RefreshCwIcon, SearchIcon, SettingsIcon, TicketIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useParams } from 'react-router'

import type { TrackerAssociation, TrackerItem, TrackerItemResponse } from '@open-mercato/cezar-api-client'
import { useLocale } from '@/components/locale-provider'
import { IssueBrowserLayout } from '@/components/issue-browser-layout'
import { CenteredState } from '@/components/centered-state'
import { useIsDesktop } from '@/lib/use-desktop'
import { shortAge } from '@/lib/format'
import { formatLocale } from '@/lib/locale'
import { cn } from '@/lib/utils'
import { TRACKER_PROVIDERS } from '@/lib/tracker-providers'
import { getTrackerItem } from '@/api/client'
import { useTrackerWatch } from '@/api/tracker-watch'
import { useProjectScope } from '@/api/project-scope-context'
import { queryKeys, TRACKER_STALE_TIME, TrackerRefreshError, useSkills, useTrackerConnection, useTrackerAssociation, useTrackerItem, useTrackerItems, useWorkflows } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { Link } from '@/lib/project-router'
import { trackerLosses, trackerTaskPrompt } from '@/lib/tracker-task'
import { Markdown } from '../task-thread/markdown'
import { TrackerHandoff, type TrackerHandoffSelection, type TrackerDraftCache } from './tracker-handoff'
import { TrackerLabelFilter } from './tracker-label-filter'

const emptySelection = (): TrackerHandoffSelection => ({ workflow: null, selectedSkills: [], engine: { runner: null, model: null, account: null } })

export function TrackerRoute() {
  const { t } = useLocale()
  const { id } = useParams()
  const { projectId } = useProjectScope()
  const association = useTrackerAssociation()
  const connection = useTrackerConnection()
  const associationKey = `${projectId ?? 'default'}:${association.data?.association ? trackerAssociationKey(association.data.association) : 'none'}`
  // Retain drafts across connection request failures, but never across project/source changes.
  const drafts = useMemo<TrackerDraftCache>(() => new Map(), [associationKey])
  const [savedSelection, setSavedSelection] = useState<{ key: string; value: TrackerHandoffSelection } | null>(null)
  const selection = savedSelection?.key === associationKey ? savedSelection.value : emptySelection()
  const setSelection: React.Dispatch<React.SetStateAction<TrackerHandoffSelection>> = update => setSavedSelection(previous => {
    const current = previous?.key === associationKey ? previous.value : emptySelection()
    return { key: associationKey, value: typeof update === 'function' ? update(current) : update }
  })
  if (association.isPending) return <PageState text={t('tracker.loading')} />
  if (association.isError) return (
    <div className="p-8 text-center text-sm text-danger">
      <p>{association.error.message}</p>
      <Link className="mt-3 inline-block text-violet underline underline-offset-4" to="/settings/tracker">{t('tracker.openSettings')}</Link>
    </div>
  )
  if (!association.data.association) return <SetupState />
  // Connection-bound scopes survive disconnect so Settings can display their selection.
  // They must not mount a browser/watch without the corresponding credentials.
  if (association.data.association.connectionId) {
    if (connection.isPending) return <PageState text={t('tracker.loading')} />
    if (connection.isError) return <div role="alert" className="p-8 text-center text-sm">
      <p>{t('tracker.verifyFailed')}</p>
      <Button className="mt-3" variant="outline" onClick={() => void connection.refetch()}>{t('tracker.retryConnection')}</Button>
    </div>
    if (!connection.data.demo && (
      connection.data.connection?.id !== association.data.association.connectionId
      || connection.data.connection?.kind !== association.data.association.kind
    )) return <SetupState />
  }
  return <TrackerBrowse scopePending={association.isFetching || (!!association.data.association.connectionId && connection.isFetching)} key={associationKey} association={association.data.association} selectedId={id} drafts={drafts} selection={selection} setSelection={setSelection} />
}

function trackerAssociationKey(association: TrackerAssociation): string {
  return `${association.kind}:${association.source.id}:${association.source.webUrl}:${association.externalId}:${association.connectionId ?? 'legacy'}`
}

function SetupState() {
  const { t } = useLocale()
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center p-6 text-center">
      <TicketIcon className="size-8 text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">{t('tracker.setupTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('tracker.setupBody')}</p>
      <Link className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" to="/settings/tracker">{t('tracker.openSettings')}</Link>
    </div>
  )
}

function TrackerBrowse({ scopePending, association, selectedId, drafts, selection, setSelection }: { scopePending: boolean; association: TrackerAssociation; selectedId?: string; drafts: TrackerDraftCache; selection: TrackerHandoffSelection; setSelection: React.Dispatch<React.SetStateAction<TrackerHandoffSelection>> }) {
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const desktop = useIsDesktop()
  const listVisible = desktop || selectedId === undefined
  const [initialSelection, setInitialSelection] = useState<{ filter: string; id: string } | null>(null)
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'active' | 'all'>('active')
  const [stateExplicit, setStateExplicit] = useState(false)
  const [labels, setLabels] = useState<string[]>([])
  const result = useTrackerItems(association, { state, labels, query }, listVisible)
  const watch = useTrackerWatch({ association, state, labels, query }, result.queryKey, listVisible)
  const pages = result.data?.pages ?? []
  const failure = pages.find((page) => !page.available)
  const items = pages.flatMap((page) => page.available ? page.items : [])

  const filterKey = JSON.stringify([query, state, labels])
  const initialId = initialSelection?.filter === filterKey ? initialSelection.id : null
  useEffect(() => {
    if (initialId === null && items[0]) setInitialSelection({ filter: filterKey, id: items[0].id })
  }, [initialId, items, filterKey])
  // Pin implicit selection across automatic updates, but reset it for explicit filters.
  const detailId = selectedId ?? (desktop ? initialId : null)
  const provider = TRACKER_PROVIDERS[association.kind].label
  // Mirrors GitHub's refresh (`github.tsx`'s `openThreadRef` cascade): a manual refresh must also
  // reach the item on screen, not just the list — otherwise "refresh" is theatre for whoever is
  // currently reading an issue. The detail query always revalidates the vendor server-side
  // (`withSource(..., true, ...)` in jira.ts/linear.ts's `getItem`), so invalidating is enough.
  const refresh = async () => {
    await (watch.ready ? watch.refresh() : result.restart())
    if (detailId) void queryClient.invalidateQueries({ queryKey: queryKeys.tracker.detail(association, detailId) })
  }

  return <IssueBrowserLayout name="tracker" route="tracker" selected={selectedId !== undefined} list={<>
    <header data-slot="tracker-header" className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pt-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="text-lg font-semibold">{provider}</h1>
        <span className="min-w-0 truncate font-mono text-[11px] text-soft-foreground" title={association.externalName}>{association.externalName}</span>
        <Link to="/settings/tracker" aria-label={t('tracker.connectionSettings')} title={t('tracker.connectionSettings')} className="ml-auto shrink-0 text-soft-foreground hover:text-foreground"><SettingsIcon className="size-3.5" /></Link>
        <button type="button" aria-label={t('tracker.refresh')} title={t('tracker.refreshFrom', { provider })} disabled={watch.checking || result.isFetching} onClick={() => void refresh()} className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-soft-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-55">
          <RefreshCwIcon aria-hidden="true" className={cn('size-[9px]', (watch.checking || result.isFetching) && 'motion-safe:animate-spin')} />
          {watch.checkedAt ? t('tracker.syncedAgo', { age: shortAge(watch.checkedAt) }) : t('tracker.refreshLabel')}
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-b border-border pb-2">
        <h2 className="text-[13px] font-medium">{t('tracker.issuesCount', { count: items.length, more: result.hasNextPage ? '+' : '' })}</h2>
        <select aria-label={t('tracker.stateAria')} className="min-w-0 rounded-md border border-input bg-card px-2 py-1 text-xs" value={state} onChange={(event) => { setState(event.target.value as 'active' | 'all'); setStateExplicit(true) }}><option value="active">{t('tracker.stateActive')}</option><option value="all">{t('tracker.stateAll')}</option></select>
      </div>
      <form className="mt-2.5 flex items-center gap-2 pb-3" onSubmit={(event) => {
        event.preventDefault()
        const next = queryDraft.trim()
        const nextState = stateExplicit ? state : next ? 'all' : 'active'
        if (next === query && nextState === state) void refresh()
        else { setQuery(next); setState(nextState) }
      }}>
        <div className="relative min-w-0 flex-1"><SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-soft-foreground" /><input type="search" aria-label={t('tracker.searchAria')} maxLength={256} className="w-full rounded-md border border-input bg-card py-1 pr-2 pl-7 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder={t('tracker.searchPlaceholder')} /></div>
        <Button type="submit" variant="outline" size="sm" disabled={result.isFetching}>{t('tracker.search')}</Button>
        <TrackerLabelFilter options={items.flatMap(item => item.labels)} selected={labels} onChange={setLabels} />
      </form>
    </header>
    {watch.error ? <p role="status" className="px-4 py-2 text-xs text-danger">{watch.error}{t('tracker.outdated')}</p> : null}
    {watch.hasChanges ? <div className="m-2 rounded-md border border-border bg-muted/40 p-3 text-xs"><p>{t('tracker.newChanges')}</p><Button size="sm" className="mt-2" variant="outline" onClick={() => void watch.applyChanges()}>{t('tracker.showChanges')}</Button></div> : null}
    {result.isPending && listVisible ? <PageState text={t('tracker.loadingIssues')} /> : null}
    {result.isError ? <Failure reason={result.error.message} generation={result.errorUpdatedAt} retryAfterSeconds={result.error instanceof TrackerRefreshError && result.error.failure.code === 'rate_limited' ? result.error.failure.retryAfterSeconds : undefined} retry={() => void result.restart()} /> : null}
    {failure && !failure.available ? <Failure reason={failure.reason} generation={result.dataUpdatedAt} retryAfterSeconds={failure.code === 'rate_limited' ? failure.retryAfterSeconds : undefined} retry={() => void result.restart()} /> : null}
    {!result.isPending && !result.isError && !failure && items.length === 0 ? <PageState text={query.trim() ? t('tracker.noMatch') : t('tracker.noIssues')} /> : null}
    <ul data-slot="tracker-rows" className="flex flex-col gap-0.5 px-2 py-2">{items.map(item => <TrackerRow scopePending={scopePending} key={item.id} association={association} item={item} active={detailId === item.id} />)}</ul>
    {result.hasNextPage ? <Button className="mx-4 mb-4 shrink-0" variant="outline" onClick={() => void result.fetchNextPage()} disabled={result.isFetchingNextPage}>{t('tracker.loadMore')}</Button> : null}
  </>} detail={detailId ? <TrackerDetail scopePending={scopePending} key={`${trackerAssociationKey(association)}:${detailId}`} association={association} id={detailId} drafts={drafts} selection={selection} onSelectionChange={setSelection} /> : <CenteredState icon={<CircleDotIcon />} tone="neutral" heading="h2" title={t('tracker.nothingSelected')} subtitle={t('tracker.chooseIssue')} />} />
}

function TrackerRow({ scopePending, association, item, active }: { scopePending: boolean; association: TrackerAssociation; item: TrackerItem; active: boolean }) {
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const key = queryKeys.tracker.detail(association, item.id)
  const preload = () => void queryClient.prefetchQuery({ queryKey: key, queryFn: ({ signal }) => getTrackerItem(item.id, { signal, association }), staleTime: TRACKER_STALE_TIME })
  const drag = (event: DragEvent) => {
    if (scopePending) { event.preventDefault(); return }
    const state = queryClient.getQueryState<TrackerItemResponse>(key)
    const detail = trackerDetailReadyForDrag(queryClient, key)
    if (!detail) {
      event.preventDefault()
      preload()
      toast(
        state?.status === 'error'
          ? t('tracker.dragFailed')
          : t('tracker.dragLoading'),
        state?.status === 'error' ? { tone: 'danger' } : undefined,
      )
      return
    }
    if (trackerLosses(detail.item).length) {
      event.preventDefault()
      toast(t('tracker.dragLosses'), { tone: 'danger' })
      return
    }
    event.dataTransfer.setData('text/plain', trackerTaskPrompt(detail.item))
    event.dataTransfer.effectAllowed = 'copy'
  }
  return <li><Link to={`/tracker/${encodeURIComponent(item.id)}`} draggable onMouseEnter={preload} onFocus={preload} onDragStart={drag} data-slot="tracker-row" aria-current={active ? 'page' : undefined} title={t('tracker.dragTitle')} className={cn('flex flex-col gap-1 rounded-md px-2.5 py-2 transition-colors hover:bg-muted', active && 'bg-muted')}>
    <span className="flex min-w-0 items-center gap-2"><CircleDotIcon aria-hidden="true" className="size-3.5 shrink-0 text-violet" /><span className={cn('min-w-0 truncate text-[13px] font-medium', active && 'font-semibold')}>{item.title}</span></span>
    <span className="flex min-w-0 items-center gap-2 pl-[22px] font-mono text-[10.5px] text-muted-foreground"><span className="shrink-0">{item.id}</span><span className="min-w-0 truncate">{item.author}</span><span className="shrink-0" title={new Date(item.updatedAt).toLocaleString()}>{shortAge(item.updatedAt)}</span></span>
    <span className="flex flex-wrap gap-1 pl-[22px]"><span className="rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground">{item.status}</span>{item.labels.map(label => <span key={label} className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">{label}</span>)}</span>
  </Link></li>
}

export function trackerDetailReadyForDrag(
  queryClient: QueryClient,
  key: QueryKey,
  now = Date.now(),
): TrackerItemResponse & { available: true } | null {
  const state = queryClient.getQueryState<TrackerItemResponse>(key)
  if (
    state?.status !== 'success'
    || state.fetchStatus !== 'idle'
    || state.isInvalidated
    || state.dataUpdatedAt <= 0
    || now - state.dataUpdatedAt >= TRACKER_STALE_TIME
    || !state.data?.available
  ) return null
  return state.data
}

function TrackerDetail({ scopePending, association, id, selection, onSelectionChange, drafts }: { scopePending: boolean; drafts: TrackerDraftCache; association: TrackerAssociation; id: string; selection: TrackerHandoffSelection; onSelectionChange: React.Dispatch<React.SetStateAction<TrackerHandoffSelection>> }) {
  const { t } = useLocale()
  const detail = useTrackerItem(association, id)
  const workflows = useWorkflows()
  const skills = useSkills()
  const [lastItem, setLastItem] = useState<TrackerItem | null>(null)
  useEffect(() => {
    if (detail.data?.available) setLastItem(detail.data.item)
  }, [detail.data])
  const failure = detail.isError
    ? <Failure reason={detail.error.message} generation={detail.errorUpdatedAt} retry={() => void detail.refetch()} />
    : detail.data && !detail.data.available
      ? <Failure reason={detail.data.reason} generation={detail.dataUpdatedAt} retryAfterSeconds={detail.data.code === 'rate_limited' ? detail.data.retryAfterSeconds : undefined} retry={() => void detail.refetch()} />
      : null
  // Keep the scoped composer mounted through a failed refresh; retained context is never launchable.
  const item = detail.data?.available ? detail.data.item : lastItem
  if (!item) return <div className="p-4"><DetailBackLink />{detail.isPending ? <PageState text={t('tracker.loadingDetail')} /> : failure}</div>
  return (
    <article data-slot="tracker-detail-inner" className="min-w-0 px-4 py-4 md:px-7 md:py-5">
      <DetailBackLink />
      <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[10.5px] text-soft-foreground">
        <span>{item.id}</span>·<span>{t('tracker.issueWord')}</span>·<span>{t('tracker.openedBy', { author: item.author })}</span>·<span title={new Date(item.createdAt).toLocaleString(formatLocale())}>{t('tracker.createdAgo', { age: shortAge(item.createdAt) })}</span>·
        <a className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:underline" href={item.url} target="_blank" rel="noopener noreferrer">{t('tracker.openOn', { provider: TRACKER_PROVIDERS[association.kind].label })}<ExternalLinkIcon aria-hidden="true" className="size-2.5" /></a>
      </p>
      <h2 className="mt-2 text-xl leading-snug font-semibold">{item.title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground">{item.status}</span>{item.labels.map(label => <span key={label} className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">{label}</span>)}</div>
      {failure}
      {trackerLosses(item).length ? <div className="mt-4 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"><AlertTriangleIcon className="mr-2 inline size-4" />{t('tracker.incomplete')}</div> : null}
      <section data-slot="tracker-body" className="mt-5 text-sm"><Markdown>{item.body.trim() || t('tracker.noDescription')}</Markdown></section>
      <TrackerHandoff scopePending={scopePending} key={`${trackerAssociationKey(association)}:${item.id}`} item={item} detailUnavailable={detail.isError || !detail.data?.available} drafts={drafts} selection={selection} onSelectionChange={onSelectionChange} workflows={workflows.data?.workflows ?? []} skills={skills.data ?? []} />
    </article>
  )
}

function Failure({ reason, retry, retryAfterSeconds = 0, generation }: { reason: string; retry: () => void; retryAfterSeconds?: number; generation: number }) {
  const { t } = useLocale()
  const [cooldown, setCooldown] = useState(retryAfterSeconds)
  useEffect(() => setCooldown(retryAfterSeconds), [reason, retryAfterSeconds, generation])
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [cooldown > 0])
  return <div className="mt-5 rounded-md border border-danger/30 bg-danger/5 p-4 text-sm"><p className="text-danger">{reason}</p><div className="mt-3 flex items-center gap-3"><Button variant="outline" disabled={cooldown > 0} onClick={retry}><RefreshCwIcon className="size-3.5" />{cooldown > 0 ? t('tracker.retryIn', { seconds: cooldown }) : t('tracker.retry')}</Button><Link className="text-xs text-violet underline underline-offset-4" to="/settings/tracker">{t('tracker.trackerSettings')}</Link></div></div>
}

function PageState({ text, danger = false }: { text: string; danger?: boolean }) {
  return <div className={`p-8 text-center text-sm ${danger ? 'text-danger' : 'text-muted-foreground'}`}>{text}</div>
}

function DetailBackLink() {
  const { t } = useLocale()
  return <Link className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground md:hidden" to="/tracker"><ArrowLeftIcon aria-hidden="true" className="size-3.5" />{t('tracker.backToList')}</Link>
}
