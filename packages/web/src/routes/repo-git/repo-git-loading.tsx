import { useLocale } from '@/components/locale-provider'
import { LoaderCircleIcon } from 'lucide-react'

import { CenteredState } from '@/components/centered-state'

/** The repo view's loading surface — also the route's `Suspense` fallback (routes.tsx), so it
 *  lives outside the lazy chunk it stands in for, same reason as git-tab-loading.tsx. */
export function RepoGitLoading() {
  const { t } = useLocale()
  return (
    <div data-route="repo-git" className="flex min-h-full flex-col">
      <CenteredState
        icon={<LoaderCircleIcon className="motion-safe:animate-spin" />}
        tone="neutral"
        title={t('git.page.loadingRepo')}
        subtitle={t('git.page.fetchingState')}
      />
    </div>
  )
}
