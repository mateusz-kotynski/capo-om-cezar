import type { ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/components/locale-provider'
import type { StringPath } from '@/i18n/format'
import type { Messages } from '@/i18n/messages/types'
import type { TileId } from './preferences'

/** Module names, as dictionary keys — resolved at render so a language switch re-labels them. */
export const TILE_NAME_KEYS = {
  overview: 'dashboard.moduleOverview',
  portfolio: 'dashboard.modulePortfolio',
  automations: 'dashboard.moduleAutomations',
  fleet: 'dashboard.moduleFleet',
  needsYou: 'dashboard.moduleNeedsYou',
  recent: 'dashboard.moduleRecent',
  usage: 'dashboard.moduleUsage',
  trends: 'dashboard.moduleTrends',
} as const satisfies Record<TileId, StringPath<Messages>>
function Module({ id, children, wide }: { id: TileId; children: ReactNode; wide: boolean }) {
  const { t } = useLocale()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useSortable({ id })
  return (
    <section
      ref={setNodeRef}
      data-dashboard-module={id}
      className={`min-w-0 ${wide ? 'lg:col-span-2' : ''} ${isDragging ? 'relative z-20 opacity-80' : ''}`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <div className="flex justify-end">
        <Button
          ref={setActivatorNodeRef}
          variant="ghost"
          className="min-h-11 min-w-11 cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={t('dashboard.moveModule', { name: t(TILE_NAME_KEYS[id]) })}
        >
          <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </div>
      {children}
    </section>
  )
}
export function DashboardLayout({
  order,
  modules,
  onOrder,
}: {
  order: TileId[]
  modules: Partial<Record<TileId, ReactNode>>
  onOrder: (order: TileId[]) => void
}) {
  const { t } = useLocale()
  const name = (id: string | number) => t(TILE_NAME_KEYS[id as TileId])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const visible = order.filter((id) => modules[id])
  const wide = new Set<TileId>(['overview', 'portfolio', 'usage', 'trends'])
  // Pair consecutive compact modules in DOM order. A leftover card fills its row;
  // dense grid packing would make visual order disagree with keyboard/drag order.
  let unpaired: TileId | undefined
  for (const id of visible) {
    if (wide.has(id)) {
      if (unpaired) wide.add(unpaired)
      unpaired = undefined
    } else if (unpaired) unpaired = undefined
    else unpaired = id
  }
  if (unpaired) wide.add(unpaired)
  const describe = (id: string | number) =>
    t('dashboard.positionOf', { name: name(id), position: visible.indexOf(id as TileId) + 1, total: visible.length })
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => t('dashboard.pickedUp', { description: describe(active.id) }),
          onDragOver: ({ active, over }) =>
            over
              ? t('dashboard.movedTo', {
                  name: name(active.id),
                  position: visible.indexOf(over.id as TileId) + 1,
                  total: visible.length,
                })
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? t('dashboard.droppedAt', {
                  name: name(active.id),
                  position: visible.indexOf(over.id as TileId) + 1,
                  total: visible.length,
                })
              : t('dashboard.orderUnchanged', { description: describe(active.id) }),
          onDragCancel: ({ active }) => t('dashboard.reorderCancelled', { description: describe(active.id) }),
        },
        screenReaderInstructions: {
          draggable: t('dashboard.dragInstructions'),
        },
      }}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        onOrder(
          arrayMove(
            order,
            order.indexOf(active.id as TileId),
            order.indexOf(over.id as TileId),
          ),
        )
      }}
    >
      <SortableContext items={visible} strategy={rectSortingStrategy}>
        <div className="grid items-start gap-x-5 gap-y-2 lg:grid-cols-2">
          {visible.map((id) => (
            <Module key={id} id={id} wide={wide.has(id)}>
              {modules[id]}
            </Module>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
