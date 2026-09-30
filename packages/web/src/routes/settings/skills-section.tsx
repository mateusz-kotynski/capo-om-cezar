import { useLocale } from '@/components/locale-provider'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheckIcon } from 'lucide-react'

import { putWorkspaceConfig } from '@/api/client'
import { useProjects, useSkillsUpdate, useWorkspaceConfig, workspaceQueryKeys } from '@/api/queries'
import type { SetWorkspaceConfigInput, WorkspaceConfigResponse } from '@open-mercato/cezar-api-client'
import { CenteredState } from '@/components/centered-state'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toaster'

export function SkillsSection() {
  const { t } = useLocale()
  const config = useWorkspaceConfig()
  const projects = useProjects()
  const projectId = projects.data?.bootProject ?? ''
  const update = useSkillsUpdate(projectId, Boolean(projectId))

  if (config.isPending) {
    return (
      <p data-slot="skills-settings-loading" className="p-4 text-[13px] text-soft-foreground md:p-6">
        {t('prefs.skills.loading')}
      </p>
    )
  }
  if (config.isError) {
    return (
      <CenteredState
        icon={<PackageCheckIcon />}
        tone="danger"
        title={t('prefs.skills.loadFailed')}
        subtitle={config.error.message}
        heading="h2"
      />
    )
  }
  return <SkillsForm config={config.data} update={update.data} updateError={update.error} />
}

function SkillsForm({
  config,
  update,
  updateError,
}: {
  config: WorkspaceConfigResponse
  update?: ReturnType<typeof useSkillsUpdate>['data']
  updateError: Error | null
}) {
  const { t, tn } = useLocale()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (patch: SetWorkspaceConfigInput) => putWorkspaceConfig(patch),
    onSuccess: (result) => queryClient.setQueryData(workspaceQueryKeys.config, result),
    onError: (error: Error) => toast(error.message, { tone: 'danger' }),
  })
  const inherited = config.skillsAutoUpdate === null
  const status = (() => {
    if (updateError) return t('prefs.skills.statusUnavailable')
    if (!update) return t('prefs.skills.statusChecking')
    if (update.status === 'unavailable')
      return update.scopes.find((scope) => scope.reason)?.reason ?? t('prefs.skills.updatesUnavailable')
    if (update.scopes.every((scope) => scope.skills.length === 0))
      return t('prefs.skills.noneFound')
    const count = new Set(update.scopes.flatMap((scope) => scope.skills)).size
    return tn('prefs.skills.found', count)
  })()

  return (
    <div
      data-slot="skills-settings-section"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-[calc(90px+env(safe-area-inset-bottom))] md:p-6 md:pb-6"
    >
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              <label htmlFor="skills-auto-update">{t('prefs.skills.title')}</label>
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {t('prefs.skills.body')}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Switch
              id="skills-auto-update"
              data-slot="skills-auto-update"
              checked={config.effectiveSkillsAutoUpdate}
              disabled={save.isPending}
              onCheckedChange={(checked) => save.mutate({ skillsAutoUpdate: checked })}
            />
            <span className="text-[11px] text-soft-foreground">
              {config.effectiveSkillsAutoUpdate ? t('prefs.skills.on') : t('prefs.skills.off')}
              {inherited ? t('prefs.skills.defaultSuffix') : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {inherited
              ? t('prefs.skills.inheritedNote')
              : t('prefs.skills.overrideNote')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-action="skills-use-default"
            disabled={inherited || save.isPending}
            onClick={() => save.mutate({ skillsAutoUpdate: null })}
          >
            {t('prefs.skills.useDefault')}
          </Button>
        </div>
        <p
          data-slot="skills-installation-status"
          role={updateError || update?.status === 'unavailable' ? 'status' : undefined}
          className="text-[13px] text-soft-foreground"
        >
          {status}
        </p>
      </section>
    </div>
  )
}
