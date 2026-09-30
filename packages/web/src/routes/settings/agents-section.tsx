import { useLocale } from '@/components/locale-provider'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BotIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { putConfig } from '@/api/client'
import {
  queryKeys,
  useAgentProfiles,
  useConfig,
  useProjects,
  useProviderStatus,
  useRepo,
  useRunnerModelCatalogs,
  useSelectAgentProfile,
} from '@/api/queries'
import { useProjectScope } from '@/api/project-scope-context'
import type { ConfigResponse, Runner, SetConfigInput } from '@open-mercato/cezar-api-client'
import { CenteredState } from '@/components/centered-state'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toaster'
import { providerStatusFor } from '@/lib/provider-status'
import {
  DefaultAgentPicker,
  agentPickerRows,
  hasAgentAccounts,
} from '@/components/default-agent-picker'
import { modelCatalogStatus, modelsForRunner, RUNNERS } from '@/routes/new-task-form'
import { ProviderSettings } from './provider-settings'

/**
 * Settings → Agents (R6 Step 1.5, spec §"Settings"): today's scattered `PUT /api/config` knobs
 * in one place — default runner, per-runner model presets, THE system prompt (this is its
 * single edit surface: the /new composer intentionally has none, user decision in R4), and the
 * base branch (also settable from the Git view's branch picker; both write the same key).
 *
 * Copy stays coding-agent-agnostic by rule: the section describes capabilities (`runner`,
 * `model`, `system prompt`), never vendor config formats.
 *
 * Persistence: every control PUTs a partial patch; the server merges it into the raw
 * config.json so user keys survive. The PUT answers the full knob shape, which lands straight
 * in the `config` query — the readback is the server's own truth, not an optimistic guess.
 */

/** The server's validation cap for the system prompt (src/config.ts) — enforced here too so an
 *  over-limit draft is a disabled Save with a reason, not a 400 round-trip. */
const SYSTEM_PROMPT_MAX = 20_000

export function AgentsSection() {
  const { t } = useLocale()
  const config = useConfig()
  // One row per runner here, so every runner's own host catalog is needed at once (#794) —
  // unlike the composer, which only ever renders the runner the user picked.
  const catalogs = useRunnerModelCatalogs()
  const providerStatus = useProviderStatus()

  if (config.isPending) {
    return (
      <p data-slot="agents-loading" className="p-4 text-[13px] text-soft-foreground md:p-6">
        {t('prefs.agents.loading')}
      </p>
    )
  }
  if (config.isError) {
    return (
      <CenteredState
        icon={<BotIcon />}
        tone="danger"
        title={t('prefs.agents.loadFailed')}
        subtitle={config.error.message}
        heading="h2"
      />
    )
  }
  return <AgentsForm config={config.data} catalogs={catalogs} providerStatus={providerStatus} />
}

function AgentsForm({
  config,
  catalogs,
  providerStatus,
}: {
  config: ConfigResponse
  catalogs: ReturnType<typeof useRunnerModelCatalogs>
  providerStatus: ReturnType<typeof useProviderStatus>
}) {
  const { t, locale } = useLocale()
  const repo = useRepo()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (patch: SetConfigInput) => putConfig(patch),
    onSuccess: (result) => {
      // The PUT already answers the merged knobs — no refetch needed for this section. The
      // same knobs surface elsewhere though: defaultRunner in /api/health, baseBranch in
      // /api/repo — refresh both so the composer and the Git view agree immediately.
      queryClient.setQueryData(queryKeys.config, result)
      void queryClient.invalidateQueries({ queryKey: queryKeys.health })
      void queryClient.invalidateQueries({ queryKey: queryKeys.repo })
    },
    // 400/409/500 alike: the server's own words, verbatim (the repo-wide error doctrine).
    onError: (error: Error) => toast(error.message, { tone: 'danger' }),
  })

  // The system prompt edits locally and saves explicitly — a textarea that PUT-ed 20k
  // characters on every keystroke would be a worse control, not a simpler one.
  const [prompt, setPrompt] = useState(config.systemPrompt ?? '')
  const trimmedPrompt = prompt.trim()
  const promptSaved = trimmedPrompt === (config.systemPrompt ?? '')
  const promptOverLimit = trimmedPrompt.length > SYSTEM_PROMPT_MAX
  const savePrompt = () =>
    save.mutate(
      { systemPrompt: trimmedPrompt === '' ? null : trimmedPrompt },
      {
        onSuccess: () =>
          toast(trimmedPrompt === '' ? t('prefs.agents.promptCleared') : t('prefs.agents.promptSaved')),
      },
    )

  return (
    <div
      data-slot="agents-section"
      className="mx-auto flex w-full max-w-2xl flex-col gap-7 p-4 pb-[calc(90px+env(safe-area-inset-bottom))] md:p-6 md:pb-6"
    >
      <ProviderSettings />

      <DefaultAgentField
        defaultRunner={config.defaultRunner}
        providerStatus={providerStatus}
        saving={save.isPending}
        onPick={(runner) => save.mutate({ defaultRunner: runner })}
      />

      <Field
        title={t('prefs.agents.modelsTitle')}
        hint={
          config.modelsLocked
            ? t('prefs.agents.modelsLocked')
            : t('prefs.agents.modelsHint')
        }
      >
        <div className="flex max-w-md flex-col gap-2">
          {RUNNERS.map((runner) => {
            const provider = providerStatusFor(providerStatus.data, runner.id)
            const providerConnected =
              !providerStatus.isPending &&
              !providerStatus.isError &&
              provider?.enabled === true &&
              provider.status === 'connected'
            const providerReason = providerStatus.isPending
              ? t('prefs.agents.checkingAuth')
              : providerStatus.isError
                ? t('prefs.agents.authFailed')
                : provider?.enabled === false
                  ? t('prefs.agents.providerDisabled')
                : providerConnected
                  ? undefined
                  : t('prefs.agents.connectFirst')
            const catalog = catalogs[runner.id]
            const catalogStatus = modelCatalogStatus(runner.id, catalog.data, catalog.isError)
            const modelOptions = modelsForRunner(runner.id, catalog.data, [
              config.defaultModels[runner.id],
            ])
            const configuredModel = config.defaultModels[runner.id] ?? ''
            const configuredModelLabel =
              modelOptions.find((model) => model.id === configuredModel)?.label ??
              configuredModel ??
              t('prefs.agents.autoDefault')
            return (
              <label key={runner.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{runner.label}</span>
                {config.modelsLocked ? (
                  <output
                    aria-label={t('prefs.agents.modelFor', { runner: runner.label })}
                    data-slot="agents-model"
                    data-runner={runner.id}
                    title={t('prefs.agents.modelLockedTitle')}
                    className="block w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs"
                  >
                    {configuredModelLabel}
                  </output>
                ) : (
                  <select
                    aria-label={t('prefs.agents.modelFor', { runner: runner.label })}
                    data-slot="agents-model"
                    data-runner={runner.id}
                    value={configuredModel}
                    title={providerReason ?? runner.desc}
                    disabled={save.isPending || !providerConnected}
                    onChange={(event) =>
                      save.mutate({
                        defaultModels: { [runner.id]: event.target.value || null } as Partial<
                          Record<Runner, string | null>
                        >,
                      })
                    }
                    className="block w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id === '' ? t('prefs.agents.autoDefault') : model.label}
                      </option>
                    ))}
                    {catalogStatus ? <option disabled>{catalogStatus}</option> : null}
                  </select>
                )}
              </label>
            )
          })}
        </div>
      </Field>

      <Field
        title={t('prefs.agents.promptTitle')}
        hint={t('prefs.agents.promptHint')}
      >
        <Textarea
          aria-label={t('prefs.agents.promptTitle')}
          data-slot="agents-system-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('prefs.agents.promptPlaceholder')}
          className="min-h-32 max-w-xl"
        />
        <div className="flex max-w-xl items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-action="agents-save-prompt"
            disabled={promptSaved || promptOverLimit || save.isPending}
            onClick={savePrompt}
          >
            {t('common.save')}
          </Button>
          {promptOverLimit ? (
            <p data-slot="agents-prompt-limit" className="text-[11px] text-danger">
              {t('prefs.agents.promptOverLimit', {
                count: trimmedPrompt.length.toLocaleString(locale),
                max: SYSTEM_PROMPT_MAX.toLocaleString(locale),
              })}
            </p>
          ) : (
            <p className="text-[11px] text-soft-foreground">
              {t('prefs.agents.promptNote')}
            </p>
          )}
        </div>
      </Field>

      <Field
        title={t('prefs.agents.liveTitle')}
        hint={t('prefs.agents.liveTitleHint')}
      >
        <label className="flex w-fit items-center gap-3">
          <Switch
            aria-label={t('prefs.agents.liveTitle')}
            data-slot="agents-live-title-updates"
            checked={config.liveTitleUpdates ?? true}
            disabled={save.isPending}
            onCheckedChange={(checked) =>
              save.mutate(
                { liveTitleUpdates: checked },
                { onSuccess: () => toast(checked ? t('prefs.agents.liveTitleOn') : t('prefs.agents.liveTitleOff')) },
              )
            }
          />
          <span className="text-[13px] text-muted-foreground">
            {(config.liveTitleUpdates ?? true) ? t('prefs.agents.on') : t('prefs.agents.off')}
            {config.liveTitleUpdates === null && t('prefs.agents.defaultSuffix')}
          </span>
        </label>
      </Field>

      <Field
        title={t('prefs.agents.reviewTitle')}
        hint={t('prefs.agents.reviewHint')}
      >
        <label className="flex w-fit items-center gap-3">
          <Switch
            aria-label={t('prefs.agents.reviewTitle')}
            data-slot="agents-review-gate"
            checked={config.reviewGate ?? false}
            disabled={save.isPending}
            onCheckedChange={(checked) =>
              save.mutate(
                { reviewGate: checked },
                { onSuccess: () => toast(checked ? t('prefs.agents.reviewOn') : t('prefs.agents.reviewOff')) },
              )
            }
          />
          <span className="text-[13px] text-muted-foreground">
            {(config.reviewGate ?? false) ? t('prefs.agents.on') : t('prefs.agents.off')}
            {config.reviewGate === null && t('prefs.agents.defaultSuffix')}
          </span>
        </label>
      </Field>

      <Field
        title={t('prefs.agents.baseTitle')}
        hint={t('prefs.agents.baseHint')}
      >
        {repo.data?.info ? (
          <select
            aria-label={t('prefs.agents.baseTitle')}
            data-slot="agents-base-branch"
            value={config.baseBranch ?? ''}
            disabled={save.isPending}
            onChange={(event) => save.mutate({ baseBranch: event.target.value || null })}
            className="block w-full max-w-md rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="">{t('prefs.agents.followDefault')}</option>
            {repo.data.branches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <p data-slot="agents-base-branch-unavailable" className="text-[13px] text-soft-foreground">
            {repo.isPending ? t('prefs.agents.loadingBranches') : t('prefs.agents.notGit')}
          </p>
        )}
      </Field>
    </div>
  )
}

/**
 * The repo's default AGENT — and, when that agent has more than one login, which account (spec
 * 2026-07-29-agent-profiles).
 *
 * One flat list, the same shape the composer's runner pill uses:
 *
 *     claude · Default
 *     claude · Klaudiusz
 *     codex
 *
 * Not a runner control with an account control beside it. Both answers are the same decision —
 * "what does this repo run by default" — and splitting them meant reading two fields to learn one
 * fact. An agent with a single login stays a single row, so a machine with no extra accounts sees
 * exactly the control it always saw.
 *
 * The two halves land in DIFFERENT stores, and that is deliberate rather than incidental: the runner
 * is a team decision and goes in the repo's committable config, while the account is personal and
 * per-machine (`~/.cezar/agent-accounts.json`) — committing it would publish which login someone
 * works under. Hence two writes for one click, and the copy says so.
 */
function DefaultAgentField({
  defaultRunner,
  providerStatus,
  saving,
  onPick,
}: {
  defaultRunner: Runner
  providerStatus: ReturnType<typeof useProviderStatus>
  saving: boolean
  onPick: (runner: Runner) => void
}) {
  const { t, locale } = useLocale()
  const profiles = useAgentProfiles()
  const projects = useProjects()
  const scope = useProjectScope()
  const repo = useRepo()
  const select = useSelectAgentProfile()

  // `projectId: null` is the boot project, which every route addresses by the reserved `default`
  // alias. The repo ROOT is the key the account store uses, and `useRepo` is project-scoped so it
  // already answers for the ACTIVE project.
  const projectId = scope.projectId ?? 'default'
  const repoRoot = repo.data?.info?.root
  // Repo first, then the machine-wide default — the same order the server resolves in, so the
  // checked row is the account a task would really run under rather than a guess.
  const selection = repoRoot ? profiles.data?.selections[repoRoot] : undefined
  const machine = profiles.data?.defaults
  const rows = agentPickerRows(profiles.data?.profiles ?? [])
  const hasAccounts = hasAgentAccounts(rows)

  return (
    <Field
      title={hasAccounts ? t('prefs.agents.defaultAgent') : t('prefs.agents.defaultRunner')}
      hint={
        hasAccounts
          ? t('prefs.agents.defaultAgentHintAccounts')
          : t('prefs.agents.defaultAgentHint')
      }
    >
      <DefaultAgentPicker
        rows={rows}
        runner={defaultRunner}
        accountFor={(id) => selection?.[id] ?? machine?.[id] ?? null}
        providerStatus={providerStatus}
        disabled={saving}
        // The account half needs a project to write against; the runner half does not, so only an
        // account row waits on the registry.
        accountDisabled={select.isPending || projects.data === undefined}
        onPick={(runner, account, hasAccountChoice) => {
          if (runner !== defaultRunner) onPick(runner)
          // Only when this agent HAS a choice of accounts: a single-login agent must not write a
          // selection, or the store would fill up with rows that say nothing.
          if (hasAccountChoice) {
            select.mutate(
              { projectId, provider: runner, profileId: account },
              { onError: (error: Error) => toast(error.message, { tone: 'danger' }) },
            )
          }
        }}
      />
      {!providerStatus.isPending &&
      !providerStatus.isError &&
      providerStatusFor(providerStatus.data, defaultRunner)?.enabled === false ? (
        <p className="text-[13px] text-muted-foreground">
          {t('prefs.agents.providerDisabled')}
        </p>
      ) : null}
      {hasAccounts ? (
        <p className="max-w-md text-[13px] text-muted-foreground">
          {t('prefs.agents.otherAccount')}
        </p>
      ) : null}
    </Field>
  )
}

/** The Appearance section's field chassis — same rhythm, so Settings reads as one surface. */
function Field({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  )
}
