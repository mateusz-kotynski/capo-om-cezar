import { CopyIcon } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLocale } from '@/components/locale-provider'
import { RichText } from '@/components/rich-text'
import { cliOf, type CliDefinition } from '@/lib/automation-cli'

import { copyText } from './use-automations'

/**
 * "Copy as CLI" (spec 2026-09-14-automations-redesign Q1, § UI/UX 4): the `cez automation add`
 * flag form of what the form holds when the definition is expressible in flags, the JSON
 * `create` form otherwise — the same body the Save button sends, so the line recreates exactly
 * what the cockpit would store.
 */
export function CopyAsCliCard({ definition }: { definition: CliDefinition }) {
  const { t } = useLocale()
  const line = useMemo(() => cliOf(definition), [definition])
  return (
    <Card flush data-slot="copy-as-cli" className="px-3.5 py-3">
      <div className="mb-2 flex items-center">
        <span className="text-[11px] font-semibold tracking-[.05em] uppercase text-soft-foreground">{t('automations.copyAsCli')}</span>
        <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={() => void copyText(line, t)}>
          <CopyIcon aria-hidden="true" className="size-3" />
          {t('automations.copy')}
        </Button>
      </div>
      <pre className="m-0 rounded-lg border border-border bg-card-2 px-2.5 py-2 font-mono text-[11.5px] leading-[1.6] break-words whitespace-pre-wrap text-muted-foreground">
        {line}
      </pre>
      <p className="mt-2 mb-0 text-[11.5px] leading-[1.5] text-soft-foreground">
        <RichText text={t('automations.cliHint')} tags={{ code: (c) => <code className="text-[11px]">{c}</code> }} />
      </p>
    </Card>
  )
}
