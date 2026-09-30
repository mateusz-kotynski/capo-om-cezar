import {
  CopyIcon,
  EyeIcon,
  EllipsisIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PowerIcon,
  ScrollTextIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import type { AutomationListEntry } from '@open-mercato/cezar-api-client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLocale } from '@/components/locale-provider'
import { useNavigate } from '@/lib/project-router'

import type { AutomationActions } from './use-automations'

/**
 * The actions cell of one list row (spec 2026-09-14-automations-redesign § UI/UX 1, column 9):
 * Run now · Pause|Enable · More (Edit · View log · Duplicate · Copy as CLI · Delete). Every
 * click in here stops at the cell — the row itself opens the editor, and a pause must never
 * also navigate. The menu and the confirm are portaled, so they stop propagation on their own
 * content too: React bubbles synthetic events through portals to the row.
 */
export function RowActions({ automation, actions }: { automation: AutomationListEntry; actions: AutomationActions }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const stop = (event: SyntheticEvent) => event.stopPropagation()
  const editorPath = `/automations/${encodeURIComponent(automation.id)}`

  return (
    <span data-slot="row-actions" className="inline-flex gap-0.5" onClick={stop}>
      {automation.kind !== 'schedule' ? <Button variant="ghost" size="icon-sm" title={t('automations.previewMatches')} aria-label={t('automations.previewMatches')} disabled={actions.busy} onClick={() => void actions.preview(automation)}>
        <EyeIcon className="size-[13px]" />
      </Button> : null}
      <Button
        variant="ghost"
        size="icon-sm"
        title={t('automations.runNow')}
        aria-label={t('automations.runNow')}
        disabled={actions.busy}
        onClick={() => void actions.runNow(automation)}
      >
        <PlayIcon className="size-[13px]" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title={automation.enabled ? t('automations.pause') : t('automations.enable')}
        aria-label={automation.enabled ? t('automations.pause') : t('automations.enable')}
        disabled={actions.busy}
        onClick={() => void actions.toggleEnabled(automation)}
      >
        {automation.enabled ? <PauseIcon className="size-[13px]" /> : <PowerIcon className="size-[13px]" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('automations.more')}>
            <EllipsisIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]" onClick={stop}>
          <DropdownMenuItem onSelect={() => navigate(editorPath)}>
            <PencilIcon />
            {t('automations.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`${editorPath}/log`)}>
            <ScrollTextIcon />
            {t('automations.viewLog')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void actions.duplicate(automation)}>
            <CopyIcon />
            {t('automations.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void actions.copyCli(automation)}>
            <TerminalIcon />
            {t('automations.copyAsCli')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2Icon />
            {t('automations.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automations.deleteTitle', { name: automation.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('automations.deleteBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automations.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:brightness-[0.96]"
              onClick={() => void actions.remove(automation)}
            >
              {t('automations.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  )
}
