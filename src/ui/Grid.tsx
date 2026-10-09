import { AnimatePresence, motion } from 'motion/react'
import type { ComponentType } from 'react'
import { usePriorities } from '../priority/usePriorities'
import { useMetrics } from '../stores/metrics'
import type { RankedItem } from '../stores/priority'
import { ui, useUi, type ItemKind, type TileId } from '../stores/ui'
import { CardShell } from './cards/CardShell'
import { ItemPanel } from './cards/ItemPanel'
import { Panel } from './cards/Panel'
import { PriorityCard } from './cards/PriorityCard'
import { Reader } from './cards/Reader'
import { FindsCard } from './cards/FindsCard'
import { FindsPanel } from './cards/FindsPanel'
import { glide } from './motion'
import { CALENDAR_ACCENT, CalendarDetail, CalendarFace } from './tiles/Calendar'
import type { Corner } from './tiles/Face'
import { GOALS_ACCENT, GoalsDetail, GoalsFace } from './tiles/Goals'
import { INBOX_ACCENT, InboxDetail, InboxFace } from './tiles/Inbox'
import { TASKS_ACCENT, TasksDetail, TasksFace } from './tiles/Tasks'

interface ListDef {
  label: string
  accent: string
  Face: ComponentType<{ corner: Corner }>
  Detail: ComponentType
}

/** Full domain lists: opened from the header, an item's "See all", a summary card, or Wendy. */
const LISTS: Record<TileId, ListDef> = {
  tasks: { label: 'Tasks', accent: TASKS_ACCENT, Face: TasksFace, Detail: TasksDetail },
  calendar: { label: 'Calendar', accent: CALENDAR_ACCENT, Face: CalendarFace, Detail: CalendarDetail },
  goals: { label: 'Goals', accent: GOALS_ACCENT, Face: GoalsFace, Detail: GoalsDetail },
  inbox: { label: 'Inbox', accent: INBOX_ACCENT, Face: InboxFace, Detail: InboxDetail },
}

const KIND_LIST: Record<ItemKind, TileId> = { task: 'tasks', event: 'calendar', notification: 'inbox', goal: 'goals' }
const FILL_ORDER: TileId[] = ['calendar', 'tasks', 'inbox', 'goals']

type Slot =
  | { type: 'item'; key: string; item: RankedItem; rank: number }
  | { type: 'list'; key: string; tile: TileId }
  | { type: 'wendy'; key: 'wendy' }

/**
 * Three ranked priority cards (any domain) plus Wendy's answer in the bottom
 * right. If there are fewer than three things to tackle, calm domain summaries
 * fill the gaps. Cards glide to their new slot when the ranking changes.
 */
function useSlots(): Slot[] {
  const ranked = usePriorities()
  const slots: Slot[] = ranked.map((item, i) => ({ type: 'item', key: item.key, item, rank: i + 1 }))
  const shown = new Set(ranked.map((r) => KIND_LIST[r.kind]))
  for (const pass of [0, 1]) {
    for (const tile of FILL_ORDER) {
      if (slots.length >= 3) break
      const taken = slots.some((s) => s.type === 'list' && s.tile === tile)
      if (!taken && (pass === 1 || !shown.has(tile))) slots.push({ type: 'list', key: `list:${tile}`, tile })
    }
  }
  return [...slots.slice(0, 3), { type: 'wendy', key: 'wendy' }]
}

export function Grid() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus)
  const selected = useUi((s) => s.selected)
  const reader = useUi((s) => s.reader)
  const finds = useUi((s) => s.finds)
  const chatOpen = useUi((s) => s.chatOpen)
  const slots = useSlots()

  const itemPanel = !focus && selected ? selected : null
  const openKey = finds ? 'wendy' : itemPanel ? `${itemPanel.kind}:${itemPanel.id}` : focus ? `list:${focus}` : null
  // The reader isn't tied to a card; it floats over the grid like any panel.
  const panelOpen = openKey !== null || reader

  return (
    <motion.div
      className="fixed"
      style={{ left: m.gridX, top: m.gridY, width: m.gridW, height: m.gridH }}
      animate={{ scale: chatOpen ? 0.94 : 1, opacity: chatOpen ? 0.3 : 1 }}
      transition={glide}
    >
      <div
        className={
          m.stack
            ? 'scroll-y grid h-full w-full grid-cols-1 content-start'
            : 'grid h-full w-full grid-cols-2 grid-rows-2'
        }
        // Stacked: one column, most important first, each card a fixed height.
        style={m.stack ? { gap: m.gap, gridAutoRows: m.cellH } : { gap: m.gap }}
      >
        {slots.map((slot, i) => {
          // Stacked cards all read the same way (no orb notch, left-aligned).
          const corner = (m.stack ? 0 : i) as Corner
          // The open card unmounts so its layoutId can morph into the panel.
          if (slot.key === openKey) return <div key={slot.key} />
          if (slot.type === 'wendy') return <FindsCard key="wendy" corner={corner} hidden={panelOpen} />
          if (slot.type === 'item') {
            return (
              <PriorityCard
                key={slot.key}
                item={slot.item}
                rank={slot.rank}
                corner={corner}
                hidden={panelOpen}
                compact={m.compact}
              />
            )
          }
          const def = LISTS[slot.tile]
          return (
            <CardShell
              key={slot.key}
              layoutId={`list-${slot.tile}`}
              corner={corner}
              accent={def.accent}
              hidden={panelOpen}
              label={`Open ${def.label}`}
              onOpen={() => ui.focus(slot.tile)}
            >
              <def.Face corner={corner} />
            </CardShell>
          )
        })}
      </div>
      {/* Panels fill the panel box: the grid itself, or on phones nearly the whole screen. */}
      <div
        className="pointer-events-none absolute"
        style={{ left: m.panel.x - m.gridX, top: m.panel.y - m.gridY, width: m.panel.w, height: m.panel.h }}
      >
        <AnimatePresence>
          {focus && <ListPanel key={`list-${focus}`} id={focus} />}
          {itemPanel && <ItemPanel key={`item-${itemPanel.kind}:${itemPanel.id}`} item={itemPanel} />}
          {reader && <Reader key="reader" />}
          {finds && <FindsPanel key="finds" />}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function ListPanel({ id }: { id: TileId }) {
  const { Detail, accent, label } = LISTS[id]
  return (
    <Panel layoutId={`list-${id}`} accent={accent} title={label} onClose={() => ui.focus(null)}>
      <Detail />
    </Panel>
  )
}
