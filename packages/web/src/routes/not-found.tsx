import { useLocale } from '@/components/locale-provider'
import { CompassIcon } from 'lucide-react'
import { CenteredState } from '@/components/centered-state'
import { Link } from '@/lib/project-router'
import { Button } from '@/components/ui/button'

/** The 404. Neutral, not danger — a mistyped URL is a dead end, not a failure of ours —
 *  and the one action is the way home (spec, "Routing": unknown routes → CenteredState 404
 *  with a "Back to tasks" action). */
export function NotFoundRoute() {
  const { t } = useLocale()
  return (
    <div data-route="not-found" className="flex min-h-full flex-col">
      <CenteredState
        icon={<CompassIcon />}
        tone="neutral"
        title={t('shell.misc.notFoundTitle')}
        subtitle={t('shell.misc.notFoundSubtitle')}
        actions={
          <Button asChild variant="outline">
            <Link to="/">{t('shell.misc.backToTasks')}</Link>
          </Button>
        }
      />
    </div>
  )
}
