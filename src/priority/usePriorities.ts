import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEntities } from '../stores/entities'
import { mergePriorities, usePriorityStore, type RankedItem } from '../stores/priority'
import { useNow } from '../ui/tiles/data'
import { scoreItems, type PriorityItem } from './score'

/** All scored candidates, best first (recomputed as data or the clock moves). */
function useCandidates(): PriorityItem[] {
  const e = useEntities(
    useShallow((s) => ({ tasks: s.tasks, goals: s.goals, events: s.events, notifications: s.notifications })),
  )
  const now = useNow(30_000)
  return useMemo(() => scoreItems(e, now), [e, now])
}

/** The three cards to show, in order. */
export function usePriorities(): RankedItem[] {
  const local = useCandidates()
  const wendy = usePriorityStore((s) => s.wendy)
  const pushed = usePriorityStore((s) => s.pushed)
  const now = useNow(60_000)
  return useMemo(
    () => mergePriorities(local, wendy, pushed && pushed.until > now ? pushed.entries : null),
    [local, wendy, pushed, now],
  )
}
