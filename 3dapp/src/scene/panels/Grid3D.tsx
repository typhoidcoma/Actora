import { usePriorities } from '@actora/priority/usePriorities'
import type { RankedItem } from '@actora/stores/priority'
import type { ItemKind, TileId } from '@actora/stores/ui'
import { useFocused } from '../../look/focus'
import { usePresence } from '../../look/motion'
import { FindsCard3D } from './FindsCard3D'
import { ListCard3D } from './ListCard3D'
import { PriorityCard3D } from './PriorityCard3D'
import { MessageCard3D } from './MessageCard3D'
import { cardsWithMessage, useMessageCard } from '@actora/social/homeCard'
import type { MessageCardData } from '@actora/stores/social'

type Slot =
  | { type: 'item'; key: string; item: RankedItem }
  | { type: 'message'; key: string; card: MessageCardData }
  | { type: 'list'; key: string; tile: TileId }

const KIND_LIST: Record<ItemKind, TileId> = { task: 'tasks', event: 'calendar', notification: 'inbox', goal: 'goals' }
const FILL_ORDER: TileId[] = ['calendar', 'tasks', 'inbox', 'goals']

/** The 2D Grid's slots: up to three ranked priorities (unread messages slotted in), then calm list summaries. */
function useSlots(): Slot[] {
  const ranked = usePriorities()
  const message = useMessageCard()
  const slots: Slot[] = cardsWithMessage(ranked, message).map((c) =>
    c.type === 'message'
      ? { type: 'message', key: `dm:${c.card.threadId}`, card: c.card }
      : { type: 'item', key: c.item.key, item: c.item },
  )
  const shown = new Set(ranked.map((r) => KIND_LIST[r.kind]))
  for (const pass of [0, 1]) {
    for (const tile of FILL_ORDER) {
      if (slots.length >= 3) break
      const taken = slots.some((s) => s.type === 'list' && s.tile === tile)
      if (!taken && (pass === 1 || !shown.has(tile))) slots.push({ type: 'list', key: `list:${tile}`, tile })
    }
  }
  return slots
}

/**
 * The 2D Grid around her: three slots, then the finds card in the fourth corner.
 * Cards glide to a new corner when the ranking changes and ease out when they
 * drop off; all of them step back while something is open (focus mode).
 */
export function Grid3D() {
  const focused = useFocused()
  const [list, done] = usePresence(useSlots(), (s) => s.key)
  return (
    <>
      {list.map((p) =>
        p.item.type === 'item' ? (
          <PriorityCard3D key={p.key} item={p.item.item} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ) : p.item.type === 'message' ? (
          <MessageCard3D key={p.key} card={p.item.card} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ) : (
          <ListCard3D key={p.key} tile={p.item.tile} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ),
      )}
      <FindsCard3D corner={3} present={!focused} />
    </>
  )
}
