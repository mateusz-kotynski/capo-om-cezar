import { useLocale } from '@/components/locale-provider'
import { RichText } from '@/components/rich-text'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GaugeIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { putWorkspaceConfig } from '@/api/client'
import { useWorkspaceConfig, workspaceQueryKeys } from '@/api/queries'
import type { SetWorkspaceConfigInput, WorkspaceConfigResponse } from '@open-mercato/cezar-api-client'
import { CenteredState } from '@/components/centered-state'
import { IntegerStepper } from '@/components/integer-stepper'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { MachineCard } from './machine-card'
import { SettingsField } from './settings-field'

/**
 * Global settings → Resources: how hard the MACHINE works. `maxParallel` caps concurrent tasks
 * across every project (the workspace semaphore holds the rest); `memoryLimitMb` is the
 * per-task ceiling the engine enforces by pausing a task that crosses it and letting the queue
 * advance (#memory-guard).
 *
 * Both are workspace-level since the multi-project split (spec §"Resource governance"): they
 * protect the host, not a repo, so they live in `~/.cezar/config.json` and persist through
 * `PUT /api/workspace/config` — the merged answer lands straight in the workspace config query,
 * and the server refreshes the shared semaphore so a change takes effect without a restart.
 * Leftover per-repo `maxParallel`/`memoryLimitMb` keys were imported once by Migration 001 and
 * are ignored afterwards; this section deliberately no longer writes them.
 *
 * Worktree retention stayed behind in the PROJECT settings (worktrees-section.tsx) — it sizes
 * one repo's own worktree pool, which is a property of the repo.
 */

const MAX_PARALLEL_MIN = 1
const MAX_PARALLEL_MAX = 16
const MAX_MONITORING_MAX = 16
const WAKE_INTERVAL_MIN = 1
const WAKE_INTERVAL_MAX = 60
/** Below this a limit would pause almost any real agent immediately — reject it as a footgun. */
const MEMORY_MIN_MB = 256

export function ResourcesSection() {
  const { t } = useLocale()
  const config = useWorkspaceConfig()

  if (config.isPending) {
    return (
      <p data-slot="resources-loading" className="p-4 text-[13px] text-soft-foreground md:p-6">
        {t('prefs.resources.loading')}
      </p>
    )
  }
  if (config.isError) {
    return (
      <CenteredState
        icon={<GaugeIcon />}
        tone="danger"
        title={t('prefs.resources.loadFailed')}
        subtitle={config.error.message}
        heading="h2"
      />
    )
  }
  return <ResourcesForm config={config.data} />
}

function ResourcesForm({ config }: { config: WorkspaceConfigResponse }) {
  const { t } = useLocale()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (patch: SetWorkspaceConfigInput) => putWorkspaceConfig(patch),
    onSuccess: (result) => queryClient.setQueryData(workspaceQueryKeys.config, result),
    onError: (error: Error) => toast(error.message, { tone: 'danger' }),
  })

  // Memory edits locally and saves explicitly — an empty field means "no limit".
  const [memory, setMemory] = useState(
    config.resources.memoryLimitMb ? String(config.resources.memoryLimitMb) : '',
  )
  const configuredWake = config.resources.monitoringWakeIntervalMinutes ?? null
  const [wakeMode, setWakeMode] = useState<'park' | 'interval'>(configuredWake === null ? 'park' : 'interval')
  const [wakeInterval, setWakeInterval] = useState(String(configuredWake ?? 5))
  const wakeNum = Number(wakeInterval)
  const wakeInvalid = !Number.isInteger(wakeNum) || wakeNum < WAKE_INTERVAL_MIN || wakeNum > WAKE_INTERVAL_MAX
  const wakeSaved = wakeMode === 'park'
    ? configuredWake === null
    : !wakeInvalid && configuredWake === wakeNum
  const saveWake = () => save.mutate(
    { resources: { monitoringWakeIntervalMinutes: wakeMode === 'park' ? null : wakeNum } },
    { onSuccess: () => toast(wakeMode === 'park' ? t('prefs.resources.monitoringParked') : t('prefs.resources.monitoringInterval', { count: wakeNum })) },
  )
  // Shipped ON: a server that predates the key answers without it, and reading that as "off"
  // would silently disable the feature on the one client that cannot tell the difference.
  const autoResume = config.resources.autoResumeOnUsageLimit ?? true
  const saveAutoResume = (on: boolean) => save.mutate(
    { resources: { autoResumeOnUsageLimit: on } },
    {
      onSuccess: () => toast(
        on
          ? t('prefs.resources.autoResumeOn')
          : t('prefs.resources.autoResumeOff'),
      ),
    },
  )
  const memoryNum = memory.trim() === '' ? 0 : Number(memory)
  const memoryInvalid =
    memory.trim() !== '' && (!Number.isInteger(memoryNum) || memoryNum < MEMORY_MIN_MB)
  const memorySaved = (config.resources.memoryLimitMb ?? 0) === (memoryInvalid ? -1 : memoryNum)
  const saveMemory = () =>
    save.mutate(
      // 0, not null: the workspace schema's "no limit" IS 0 (`memoryLimitMb: null` is also
      // accepted, but the route's nullable field means "clear", and clearing to the default
      // would be a different value than the user asked for).
      { resources: { memoryLimitMb: memoryNum === 0 ? null : memoryNum } },
      {
        onSuccess: () =>
          toast(memoryNum === 0 ? t('prefs.resources.memoryCleared') : t('prefs.resources.memorySet', { count: memoryNum })),
      },
    )
  const composerDefaults = config.composerDefaults ?? {
    autonomous: null,
    worktree: null,
    inheritedAutonomous: 'source-dependent' as const,
    inheritedWorktree: true,
  }
  const saveComposerDefault = (
    key: 'autonomous' | 'worktree',
    value: string,
  ) => save.mutate({
    composerDefaults: { [key]: value === 'inherit' ? null : value === 'on' },
  })

  return (
    <div
      data-slot="resources-section"
      className="mx-auto flex w-full max-w-2xl flex-col gap-7 p-4 pb-[calc(90px+env(safe-area-inset-bottom))] md:p-6 md:pb-6"
    >
      {/* Live host totals first: they answer "how is the machine" before the knobs below answer
          "how hard may cezar push it" (spec 2026-09-20-host-resource-telemetry, §UI/UX). The
          card owns its own subscription, so this screen is what keeps the sampler alive. */}
      <MachineCard />

      <SettingsField
        title={t('prefs.resources.maxTitle')}
        hint={t('prefs.resources.maxHint')}
      >
        <IntegerStepper
          aria-label={t('prefs.resources.maxTitle')}
          data-slot="resources-max-parallel"
          value={config.resources.maxParallel}
          min={MAX_PARALLEL_MIN}
          max={MAX_PARALLEL_MAX}
          onCommit={(maxParallel) => save.mutateAsync({ resources: { maxParallel: maxParallel ?? MAX_PARALLEL_MIN } })}
        />
        <p className="text-[11px] text-soft-foreground">
          <RichText
            text={t('prefs.resources.perProject')}
            tags={{
              link: (label) => (
                <Link
                  to="/settings/global/projects"
                  data-slot="resources-project-limits-link"
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {label}
                </Link>
              ),
            }}
          />
        </p>
      </SettingsField>

      <SettingsField
        title={t('prefs.resources.monitorTitle')}
        hint={t('prefs.resources.monitorHint')}
      >
        <IntegerStepper
          aria-label={t('prefs.resources.monitorTitle')}
          data-slot="resources-max-monitoring"
          value={config.resources.maxMonitoringSessions ?? 2}
          min={0}
          max={MAX_MONITORING_MAX}
          onCommit={(sessions) => save.mutateAsync({ resources: { maxMonitoringSessions: sessions ?? 0 } })}
        />
        <p className="text-[11px] text-soft-foreground">
          {t('prefs.resources.capacity', { active: config.resources.maxParallel, monitoring: config.resources.maxMonitoringSessions ?? 2 })}
        </p>
      </SettingsField>

      <SettingsField
        title={t('prefs.resources.wakeTitle')}
        hint={t('prefs.resources.wakeHint')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('prefs.resources.wakeTitle')}
            data-slot="resources-monitoring-wake-mode"
            value={wakeMode}
            disabled={save.isPending}
            onChange={(event) => setWakeMode(event.target.value as 'park' | 'interval')}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="park">{t('prefs.resources.wakePark')}</option>
            <option value="interval">{t('prefs.resources.wakeInterval')}</option>
          </select>
          {wakeMode === 'interval' ? (
            <>
              <input
                type="number"
                min={WAKE_INTERVAL_MIN}
                max={WAKE_INTERVAL_MAX}
                aria-label={t('prefs.resources.wakeIntervalAria')}
                data-slot="resources-monitoring-wake-interval"
                value={wakeInterval}
                disabled={save.isPending}
                onChange={(event) => setWakeInterval(event.target.value)}
                className="block w-24 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              />
              <span className="text-xs text-soft-foreground">{t('prefs.resources.minutes')}</span>
            </>
          ) : null}
          <Button type="button" variant="outline" size="sm" data-action="resources-save-monitoring-wake" disabled={wakeSaved || (wakeMode === 'interval' && wakeInvalid) || save.isPending} onClick={saveWake}>{t('common.save')}</Button>
        </div>
        {wakeMode === 'interval' && wakeInvalid ? (
          <p data-slot="resources-monitoring-wake-invalid" className="text-[11px] text-danger">{t('prefs.resources.wakeInvalid')}</p>
        ) : (
          <p className="text-[11px] text-soft-foreground">{t('prefs.resources.wakeNote')}</p>
        )}
      </SettingsField>

      <SettingsField
        title={t('prefs.resources.autoResumeTitle')}
        hint={t('prefs.resources.autoResumeHint')}
      >
        <select
          aria-label={t('prefs.resources.autoResumeTitle')}
          data-slot="resources-auto-resume"
          value={autoResume ? 'on' : 'off'}
          disabled={save.isPending}
          onChange={(event) => saveAutoResume(event.target.value === 'on')}
          className="block w-28 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <option value="on">{t('prefs.resources.on')}</option>
          <option value="off">{t('prefs.resources.off')}</option>
        </select>
        <p className="text-[11px] text-soft-foreground">
          {t('prefs.resources.autoResumeNote')}
        </p>
      </SettingsField>

      <SettingsField
        title={t('prefs.resources.memoryTitle')}
        hint={t('prefs.resources.memoryHint')}
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={MEMORY_MIN_MB}
            step={256}
            aria-label={t('prefs.resources.memoryAria')}
            data-slot="resources-memory-limit"
            value={memory}
            disabled={save.isPending}
            placeholder={t('prefs.resources.noLimit')}
            onChange={(event) => setMemory(event.target.value)}
            className="block w-32 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <span className="text-xs text-soft-foreground">MiB</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-action="resources-save-memory"
            disabled={memorySaved || memoryInvalid || save.isPending}
            onClick={saveMemory}
          >
            {t('common.save')}
          </Button>
        </div>
        {memoryInvalid ? (
          <p data-slot="resources-memory-invalid" className="text-[11px] text-danger">
            {t('prefs.resources.memoryInvalid', { min: MEMORY_MIN_MB })}
          </p>
        ) : (
          <p className="text-[11px] text-soft-foreground">{t('prefs.resources.memoryNote')}</p>
        )}
      </SettingsField>

      <SettingsField
        title={t('prefs.resources.defaultsTitle')}
        hint={t('prefs.resources.defaultsHint')}
      >
        <div className="grid gap-4 sm:grid-cols-2" data-slot="resources-composer-defaults">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t('prefs.resources.autonomousDefault')}</span>
            <select
              aria-label={t('prefs.resources.autonomousDefault')}
              value={composerDefaults.autonomous === null ? 'inherit' : composerDefaults.autonomous ? 'on' : 'off'}
              disabled={save.isPending}
              onChange={(event) => saveComposerDefault('autonomous', event.target.value)}
              className="rounded-md border border-input bg-card px-3 py-1.5 shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="inherit">{t('prefs.resources.inherit')}</option>
              <option value="on">{t('prefs.resources.on')}</option>
              <option value="off">{t('prefs.resources.off')}</option>
            </select>
            <span className="text-[11px] text-soft-foreground">
              {t('prefs.resources.inheritedAutonomous', {
                value:
                  composerDefaults.inheritedAutonomous === 'source-dependent'
                    ? t('prefs.resources.sourceDependent')
                    : composerDefaults.inheritedAutonomous
                      ? t('prefs.resources.on')
                      : t('prefs.resources.off'),
              })}
            </span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t('prefs.resources.worktreeDefault')}</span>
            <select
              aria-label={t('prefs.resources.worktreeDefault')}
              value={composerDefaults.worktree === null ? 'inherit' : composerDefaults.worktree ? 'on' : 'off'}
              disabled={save.isPending}
              onChange={(event) => saveComposerDefault('worktree', event.target.value)}
              className="rounded-md border border-input bg-card px-3 py-1.5 shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="inherit">{t('prefs.resources.inherit')}</option>
              <option value="on">{t('prefs.resources.on')}</option>
              <option value="off">{t('prefs.resources.off')}</option>
            </select>
            <span className="text-[11px] text-soft-foreground">
              {t('prefs.resources.inheritedAutonomous', { value: composerDefaults.inheritedWorktree ? t('prefs.resources.on') : t('prefs.resources.off') })}
            </span>
          </label>
        </div>
        <p className="text-[11px] text-soft-foreground">
          {t('prefs.resources.defaultsNote')}
        </p>
      </SettingsField>
    </div>
  )
}
