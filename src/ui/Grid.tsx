import { AnimatePresence, motion } from 'motion/react'
import type { ComponentType } from 'react'
import { usePriorities } from '../priority/usePriorities'
import { useMetrics } from '../stores/metrics'
import { ui, useUi, type TileId } from '../stores/ui'
import { CardShell } from './cards/CardShell'
import { ItemPanel } from './cards/ItemPanel'
import { Panel } from './cards/Panel'
import { PriorityCard } from './cards/PriorityCard'
import { ChatsCard } from './cards/ChatsCard'
import { homeSlots, useChatsCard, type HomeSlot } from '../social/homeCard'
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

type Slot = HomeSlot | { type: 'finds'; key: 'finds' }

/**
 * Two ranked priority cards (any domain), Chats top right (always there, so
 * it's clear where conversations live; never part of the ranking she sees),
 * and box 4 in the bottom right. If there are fewer than two things to tackle,
 * calm domain summaries fill the gaps. Cards glide to their new slot when the
 * ranking changes. The rules are shared with the 3D grid (homeSlots).
 */
function useSlots(stack: boolean): Slot[] {
  const slots: Slot[] = homeSlots(usePriorities(), useChatsCard(), stack)
  return [...slots, { type: 'finds', key: 'finds' }]
}

export function Grid() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus)
  const selected = useUi((s) => s.selected)
  const finds = useUi((s) => s.finds)
  const memories = useUi((s) => s.vault)
  const people = useUi((s) => s.people)
  const chatOpen = useUi((s) => s.chatOpen)
  const slots = useSlots(m.stack)
  const pendingAction = usePendingAction()

  const itemPanel = !focus && selected ? selected : null
  const openKey = finds ? 'finds' : itemPanel ? `${itemPanel.kind}:${itemPanel.id}` : focus ? `list:${focus}` : null
  const panelOpen = openKey !== null || memories || people
  // Wide screens, the chat open too: the panel is the right-hand window beside it.
  const paired = chatOpen && panelOpen && m.split
  const box = paired ? m.pair.right : m.panel

  return (
    <>
      {/* The cards step back behind the chat. Only the cards: a panel inside this
        scaling box would be measured mid-scale as it slides beside the chat, and shake. */}
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
            if (slot.type === 'chats')
              return <ChatsCard key="chats" card={slot.card} corner={corner} hidden={panelOpen} />
            if (slot.type === 'item') {
              return (
                <PriorityCard
                  key={slot.key}
                  item={slot.item}
                  rank={slots.filter((s) => s.type === 'item').indexOf(slot) + 1}
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
      </motion.div>
      {/* Panels fill the panel box: the grid itself, on phones nearly the whole screen,
          or beside the chat on a wide screen. */}
      <div className="pointer-events-none fixed" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
        <AnimatePresence>
          {focus && <ListPanel key={`list-${focus}`} id={focus} />}
          {itemPanel && <ItemPanel key={`item-${itemPanel.kind}:${itemPanel.id}`} item={itemPanel} />}
          {finds && <FindsPanel key="finds" />}
          {memories && <VaultPanel key="vault" />}
          {people && <PeoplePanel key="people" />}
        </AnimatePresence>
      </div>
    </>
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
