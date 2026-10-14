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
import { MessageCard } from './cards/MessageCard'
import { cardsWithMessage, useMessageCard } from '../social/homeCard'
import type { MessageCardData } from '../stores/social'
import { FindsCard } from './cards/FindsCard'
import { PendingCard } from './cards/PendingCard'
import { usePendingAction } from '../stores/pending'
import { FindsPanel } from './cards/FindsPanel'
import { VaultPanel } from './cards/VaultPanel'
import { PeoplePanel } from './people/PeoplePanel'
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

/** Full domain lists: opened from the header, an item's "See all", a summary card, or the agent. */
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
  | { type: 'message'; key: string; card: MessageCardData }
  | { type: 'list'; key: string; tile: TileId }
  | { type: 'finds'; key: 'finds' }

/**
 * Three ranked priority cards (any domain) plus the agent's answer in the bottom
 * right. Unread messages join by how fresh they are (never part of the ranking
 * she sees). If there are fewer than three things to tackle, calm domain
 * summaries fill the gaps. Cards glide to their new slot when the ranking changes.
 */
function useSlots(): Slot[] {
  const ranked = usePriorities()
  const message = useMessageCard()
  const slots: Slot[] = cardsWithMessage(ranked, message).map((c, i) =>
    c.type === 'message'
      ? { type: 'message', key: `dm:${c.card.threadId}`, card: c.card }
      : { type: 'item', key: c.item.key, item: c.item, rank: i + 1 },
  )
  const shown = new Set(ranked.map((r) => KIND_LIST[r.kind]))
  for (const pass of [0, 1]) {
    for (const tile of FILL_ORDER) {
      if (slots.length >= 3) break
      const taken = slots.some((s) => s.type === 'list' && s.tile === tile)
      if (!taken && (pass === 1 || !shown.has(tile))) slots.push({ type: 'list', key: `list:${tile}`, tile })
    }
  }
  return [...slots.slice(0, 3), { type: 'finds', key: 'finds' }]
}

export function Grid() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus)
  const selected = useUi((s) => s.selected)
  const finds = useUi((s) => s.finds)
  const memories = useUi((s) => s.vault)
  const people = useUi((s) => s.people)
  const chatOpen = useUi((s) => s.chatOpen)
  const slots = useSlots()
  const pendingAction = usePendingAction()

  const itemPanel = !focus && selected ? selected : null
  const openKey = finds ? 'finds' : itemPanel ? `${itemPanel.kind}:${itemPanel.id}` : focus ? `list:${focus}` : null
  const panelOpen = openKey !== null || memories || people

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
          // Something waiting for the user's OK takes box 4 until it's answered.
          if (slot.type === 'finds')
            return pendingAction ? (
              <PendingCard key="pending" corner={corner} hidden={panelOpen} />
            ) : (
              <FindsCard key="finds" corner={corner} hidden={panelOpen} />
            )
          if (slot.type === 'message')
            return <MessageCard key={slot.key} card={slot.card} corner={corner} hidden={panelOpen} compact={m.compact} />
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
          {finds && <FindsPanel key="finds" />}
          {memories && <VaultPanel key="vault" />}
          {people && <PeoplePanel key="people" />}
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
