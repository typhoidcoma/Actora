import { useMemo } from 'react'
import { messageCard, useSocial, type MessageCardData } from '../stores/social'
import { useNow } from '../ui/tiles/data'

/**
 * Unread messages as a home card, kept out of the priority ranking itself: that
 * list goes to Wendy (client_state), and nothing from People ever does. The
 * card joins at display time instead (cardsWithMessage).
 */
export function useMessageCard(): MessageCardData | null {
  const threads = useSocial((s) => s.threads)
  // Re-scored every half minute, so a message sinks as it ages.
  const now = useNow(30_000)
  return useMemo(() => messageCard(threads, now), [threads, now])
}

export type HomeCard<T> = { type: 'item'; item: T } | { type: 'message'; card: MessageCardData }

/** The ranked cards with the message card slotted in by score, at most `max`. */
export function cardsWithMessage<T extends { score: number }>(
  ranked: T[],
  card: MessageCardData | null,
  max = 3,
): HomeCard<T>[] {
  const out: HomeCard<T>[] = ranked.map((item) => ({ type: 'item', item }))
  if (card) {
    const at = ranked.findIndex((r) => r.score < card.score)
    out.splice(at < 0 ? out.length : at, 0, { type: 'message', card })
  }
  return out.slice(0, max)
}

/** "2 new messages · 3 min ago · 1 more chat": counts and time, never the text. */
export function messageMeta(c: MessageCardData, ago: string): string {
  const what = c.count === 1 ? 'New message' : `${c.count} new messages`
  const more = c.more ? ` · ${c.more} more chat${c.more === 1 ? '' : 's'}` : ''
  return `${what} · ${ago}${more}`
}
