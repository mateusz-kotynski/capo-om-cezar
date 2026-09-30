import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import { useProjects } from '@/api/queries'
import { useAppearance } from '@/components/appearance-provider'
import { useLocale } from '@/components/locale-provider'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Accent, Density, Width } from '@/lib/appearance'
import type { Locale } from '@/lib/locale'
import type { Theme } from '@/lib/theme'
import { useProjectOrder } from '@/lib/use-project-order'

/**
 * Settings → Appearance (R6 Step 1.3, spec §"Settings").
 *
 * Each knob is honest about where it persists:
 *  - THEME rides the existing theme system (localStorage `cez-theme`, shared with the legacy
 *    cockpit and the pre-paint script) — per-browser by design, like every OS theme choice;
 *  - LANGUAGE follows the exact same per-browser pattern (localStorage `cez-locale`, its own
 *    pre-paint stamp — see `lib/locale.ts`/`components/locale-provider.tsx`), right beside
 *    Theme, since both are "how this browser renders the cockpit" rather than repo state;
 *  - ACCENT + DENSITY persist in `ui-state.json` through the AppearanceProvider (additive
 *    `appearance` key), mirrored to localStorage for pre-paint;
 *  - PROJECT ORDER (#952) lives in the same workspace file under `sidebar.projectOrder`, so this
 *    section only offers the reset — the order itself is set by dragging the drawer.
 *
 * Every control is a real one: accent swaps the `--primary` token family, density shrinks
 * the Tailwind spacing token (see index.css). No dead knobs.
 */

type T = ReturnType<typeof useLocale>['t']

function themeOptions(t: T): Array<{ value: Theme; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }> {
  return [
    { value: 'system', label: t('appearance.themeSystem'), icon: MonitorIcon },
    { value: 'light', label: t('appearance.themeLight'), icon: SunIcon },
    { value: 'dark', label: t('appearance.themeDark'), icon: MoonIcon },
  ]
}

/** English / Polski — the requirement's own two options. Adding a locale means adding it to
 *  `Locale` (`lib/locale.ts`), both message dictionaries, and one more row here. */
function languageOptions(t: T): Array<{ value: Locale; label: string }> {
  return [
    { value: 'en', label: t('appearance.languageEnglish') },
    { value: 'pl', label: t('appearance.languagePolish') },
  ]
}

/** Swatches point at the STABLE family tokens (`--accent-lime`, `--violet`), not `--primary` —
 *  the whole point of the control is that `--primary` changes under it. */
function accentOptions(t: T): Array<{ value: Accent; label: string; swatch: string }> {
  return [
    { value: 'lime', label: t('appearance.accentLime'), swatch: 'var(--accent-lime)' },
    { value: 'violet', label: t('appearance.accentViolet'), swatch: 'var(--violet)' },
  ]
}

function densityOptions(t: T): Array<{ value: Density; label: string }> {
  return [
    { value: 'comfortable', label: t('appearance.densityComfortable') },
    { value: 'compact', label: t('appearance.densityCompact') },
    { value: 'ultra', label: t('appearance.densityUltra') },
  ]
}

function widthOptions(t: T): Array<{ value: Width; label: string }> {
  return [
    { value: 'narrow', label: t('appearance.widthNarrow') },
    { value: 'wide', label: t('appearance.widthWide') },
  ]
}

/** One segmented radio group — the shared chassis of all three controls. */
function Segmented<V extends string>({
  slot,
  label,
  value,
  options,
  onChange,
}: {
  slot: string
  label: string
  value: V
  options: Array<{ value: V; label: string; icon?: ComponentType<SVGProps<SVGSVGElement>>; swatch?: string }>
  onChange: (value: V) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-slot={slot}
      className="inline-flex w-fit gap-0.5 rounded-md border border-border bg-card p-0.5"
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-2 rounded-sm px-3 py-1.5 text-[13px] font-medium transition-colors',
              checked
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon ? <option.icon aria-hidden="true" className="size-3.5" /> : null}
            {option.swatch ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full border border-border"
                style={{ background: option.swatch }}
              />
            ) : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

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

/**
 * The undo for a drawer reordered by hand (#952) — the drag itself lives in the sidebar, where
 * it belongs, but "put it back" needs a home that is not a gesture.
 *
 * Absent entirely until there is both more than one project and an order to forget: a reset
 * button for state the user has never created is a control that can only do nothing.
 */
function ProjectOrderField() {
  const { t } = useLocale()
  const projects = useProjects()
  const { order, canReorder, reset } = useProjectOrder()
  const multiProject = (projects.data?.projects.length ?? 0) > 1
  if (!multiProject || order.length === 0) return null

  return (
    <Field title={t('appearance.projectOrderTitle')} hint={t('appearance.projectOrderHint')}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-slot="appearance-project-order-reset"
        disabled={!canReorder}
        onClick={reset}
        className="w-fit"
      >
        {t('appearance.resetOrder')}
      </Button>
    </Field>
  )
}

export function AppearanceSection() {
  const { t, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const { accent, density, width, setAccent, setDensity, setWidth } = useAppearance()

  return (
    <div
      data-slot="appearance-section"
      className="mx-auto flex w-full max-w-2xl flex-col gap-7 p-4 pb-[calc(90px+env(safe-area-inset-bottom))] md:p-6 md:pb-6"
    >
      <Field title={t('appearance.themeTitle')} hint={t('appearance.themeHint')}>
        <Segmented
          slot="appearance-theme"
          label={t('appearance.themeTitle')}
          value={theme}
          options={themeOptions(t)}
          onChange={setTheme}
        />
      </Field>

      {/* Right beside Theme — same per-browser footing, same "how this browser renders it"
          question (see the header comment). */}
      <Field title={t('appearance.languageTitle')} hint={t('appearance.languageHint')}>
        <Segmented
          slot="appearance-language"
          label={t('appearance.languageTitle')}
          value={locale}
          options={languageOptions(t)}
          onChange={setLocale}
        />
      </Field>

      <Field title={t('appearance.accentTitle')} hint={t('appearance.accentHint')}>
        <Segmented
          slot="appearance-accent"
          label={t('appearance.accentTitle')}
          value={accent}
          options={accentOptions(t)}
          onChange={setAccent}
        />
      </Field>

      <Field title={t('appearance.densityTitle')} hint={t('appearance.densityHint')}>
        <Segmented
          slot="appearance-density"
          label={t('appearance.densityTitle')}
          value={density}
          options={densityOptions(t)}
          onChange={setDensity}
        />
      </Field>

      <Field title={t('appearance.widthTitle')} hint={t('appearance.widthHint')}>
        <Segmented
          slot="appearance-width"
          label={t('appearance.widthTitle')}
          value={width}
          options={widthOptions(t)}
          onChange={setWidth}
        />
      </Field>

      <ProjectOrderField />
    </div>
  )
}
