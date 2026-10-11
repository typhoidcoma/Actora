import { usePriorities } from '@actora/priority/usePriorities'
import type { RankedItem } from '@actora/stores/priority'
import type { ItemKind, TileId } from '@actora/stores/ui'
import { useFocused } from '../../look/focus'
import { usePresence } from '../../look/motion'
import { FindsCard3D } from './FindsCard3D'
import { ListCard3D } from './ListCard3D'
import { PriorityCard3D } from './PriorityCard3D'

type Slot = { type: 'item'; key: string; item: RankedItem } | { type: 'list'; key: string; tile: TileId }

const KIND_LIST: Record<ItemKind, TileId> = { task: 'tasks', event: 'calendar', notification: 'inbox', goal: 'goals' }
const FILL_ORDER: TileId[] = ['calendar', 'tasks', 'inbox', 'goals']

/** The 2D Grid's slots: up to three ranked priorities, then calm list summaries fill the gaps. */
function useSlots(): Slot[] {
  const ranked = usePriorities()
  const slots: Slot[] = ranked.slice(0, 3).map((item) => ({ type: 'item', key: item.key, item }))
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
        ) : (
          <ListCard3D key={p.key} tile={p.item.tile} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ),
      )}
      <FindsCard3D corner={3} present={!focused} />
    </>
  )
}
