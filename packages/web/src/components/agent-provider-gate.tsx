import { useLocale } from '@/components/locale-provider'
import type { ResolvedEngine } from '@/components/engine-pills'
import { Link } from '@/lib/project-router'

/** Explain an unavailable start and keep its recovery link in the active project. */
export function AgentProviderGate({ resolved, dataSlot }: {
  resolved: Pick<ResolvedEngine, 'providerPending' | 'providerError' | 'canRun'>
  dataSlot?: string
}) {
  const { t } = useLocale()
  if (resolved.providerPending || resolved.canRun) return null
  return (
    <span data-slot={dataSlot} className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {resolved.providerError
        ? t('dialogs.common.authUnverified')
        : t('dialogs.common.connectToRun')}
      <Link to="/settings/agents#providers" className="font-medium text-foreground underline underline-offset-4">
        {t('dialogs.common.configureProviders')}
      </Link>
    </span>
  )
}
