import { useMemo } from 'react'
import type { RankedItem } from '../stores/priority'
import { chatsCard, useSocial, type ChatsCardData } from '../stores/social'
import type { ItemKind, TileId } from '../stores/ui'
import { useNow } from '../ui/tiles/data'

/**
 * The Chats box on home, kept out of the priority ranking itself: that list
 * goes to Wendy (client_state), and nothing from People ever does. Chats joins
 * at display time instead (homeSlots).
 */
export function useChatsCard(): ChatsCardData {
  const threads = useSocial((s) => s.threads)
  // Re-scored every half minute, so a message sinks as it ages.
  const now = useNow(30_000)
  return useMemo(() => chatsCard(threads, now), [threads, now])
}

export type HomeSlot =
  | { type: 'item'; key: string; item: RankedItem }
  | { type: 'chats'; key: 'chats'; card: ChatsCardData }
  | { type: 'list'; key: string; tile: TileId }

const KIND_LIST: Record<ItemKind, TileId> = { task: 'tasks', event: 'calendar', notification: 'inbox', goal: 'goals' }
const FILL_ORDER: TileId[] = ['calendar', 'tasks', 'inbox', 'goals']

/**
 * The three boxes before box 4, for both the 2D and the 3D grid. Two ranked
 * cards (calm list summaries fill any gap), and Chats, always top right on a
 * grid so it's always in the same place. In a phone's single column Chats is
 * second, or first while a fresh message outranks the top card.
 */
export function homeSlots(ranked: RankedItem[], chats: ChatsCardData, stack: boolean): HomeSlot[] {
  const rest: HomeSlot[] = ranked.slice(0, 2).map((item) => ({ type: 'item', key: item.key, item }))
  const shown = new Set(ranked.map((r) => KIND_LIST[r.kind]))
  for (const pass of [0, 1]) {
    for (const tile of FILL_ORDER) {
      if (rest.length >= 2) break
      const taken = rest.some((s) => s.type === 'list' && s.tile === tile)
      if (!taken && (pass === 1 || !shown.has(tile))) rest.push({ type: 'list', key: `list:${tile}`, tile })
    }
  }
  const box: HomeSlot = { type: 'chats', key: 'chats', card: chats }
  const first = rest[0]
  const topScore = first?.type === 'item' ? first.item.score : 0
  if (stack && chats.score > topScore) return [box, ...rest]
  return [...rest.slice(0, 1), box, ...rest.slice(1)]
}
