import { ChevronDownIcon } from 'lucide-react'

import type { ProjectListEntry } from '@open-mercato/cezar-api-client'
import { visibleNavItems } from '@/components/nav-items'
import { Link, scopeTo } from '@/lib/project-router'
import { isProjectCollapsed, type SidebarCollapsed } from '@/lib/sidebar-collapse'
import { cn } from '@/lib/utils'

/**
 * The repositories nested under a project (spec 2026-09-29-nested-repo-projects): a multi-repo
 * product's clones, each a registered project of its own with its own `/p/<id>` scope, shown
 * inside the product's group instead of as groups of their own.
 *
 * A child carries only its Git and forge tabs. Tasks, Skills, Workflows and Settings belong to
 * the product it is nested under — that is where tasks run — so the child neither lists nor
 * fetches runs.
 */
const REPO_NAV = new Set(['/git', '/github'])

export function ProjectRepos({
  repos,
  scopedProjectId,
  activeTo,
  collapsed,
  onToggle,
  onNavigate,
}: {
  repos: ProjectListEntry[]
  /** The project the URL names — a child is open by default only while you stand in it. */
  scopedProjectId: string | null
  /** The `to` of the nav item that owns the current URL. */
  activeTo: string | null
  collapsed: SidebarCollapsed
  /** Takes the anchor its default is computed against: the child's own scope, not the parent's. */
  onToggle: (projectId: string, anchorId: string | null) => void
  onNavigate?: () => void
}) {
  return (
    <div data-slot="project-repos" className="mt-1">
      <div className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-soft-foreground">
        Repositories
      </div>
      {repos.map((repo) => {
        const shut = isProjectCollapsed(collapsed, repo.id, scopedProjectId)
        const inScope = repo.id === scopedProjectId
        const bodyId = `project-repo-${repo.id}`
        return (
          <div key={repo.id} data-slot="project-repo" data-project={repo.id} data-active={inScope ? '' : undefined}>
            <div className={cn('flex items-center rounded-md transition-colors hover:bg-muted', inScope && 'bg-muted')}>
              <button
                type="button"
                onClick={() => onToggle(repo.id, scopedProjectId)}
                aria-expanded={!shut}
                aria-controls={bodyId}
                aria-label={`${shut ? 'Expand' : 'Collapse'} ${repo.name}`}
                data-slot="project-repo-disclosure"
                className="flex h-11 w-[22px] shrink-0 items-center justify-center rounded-md md:h-[30px]"
              >
                <ChevronDownIcon
                  className={cn('size-3 shrink-0 text-muted-foreground transition-transform', shut && '-rotate-90')}
                  aria-hidden="true"
                />
              </button>
              <Link
                to={scopeTo(repo.id, '/git')}
                onClick={onNavigate}
                aria-current={inScope ? 'true' : undefined}
                data-slot="project-repo-header"
                className="flex h-11 min-w-0 flex-1 items-center gap-2 pr-2 text-[13px] font-medium md:h-[30px]"
              >
                <span className="truncate">{repo.name}</span>
                {repo.branch ? (
                  <span className="ml-auto max-w-[80px] truncate font-mono text-[10.5px] font-medium text-soft-foreground">
                    {repo.branch}
                  </span>
                ) : null}
              </Link>
            </div>
            {shut ? null : (
              <nav id={bodyId} aria-label={`${repo.name} navigation`} className="ml-[11px] border-l border-border pl-2">
                {visibleNavItems({ forge: repo.forge !== undefined, forgeKind: repo.forge })
                  .filter((item) => REPO_NAV.has(item.to))
                  .map((item) => {
                    const Icon = item.icon
                    const isActive = inScope && item.to === activeTo
                    return (
                      <Link
                        key={item.to}
                        to={scopeTo(repo.id, item.to)}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-[30px]',
                          isActive && 'bg-muted font-semibold text-foreground',
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    )
                  })}
              </nav>
            )}
          </div>
        )
      })}
    </div>
  )
}
