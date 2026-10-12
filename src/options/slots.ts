import type { Option } from './types'

/**
 * The top options laid into fixed slots, keeping each one in the slot it was
 * already in when the list changes (the agent's options arriving after the instant
 * ones), so a tile only changes when its own option does. New ones fill the
 * free slots in order of relevance.
 */
export function placeInSlots(prev: Array<Option | null>, next: Option[], n: number): Array<Option | null> {
  const top = next.slice(0, n)
  const ids = new Set(top.map((o) => o.id))
  const answers = top.filter((o) => o.answer)
  const slots: Array<Option | null> = Array.from({ length: n }, (_, i) => {
    // Answers to her question take the first slots, in order.
    if (i < answers.length) return answers[i]
    const kept = prev[i]
    return kept && ids.has(kept.id) && !kept.answer ? (top.find((o) => o.id === kept.id) ?? null) : null
  })
  const placed = new Set(slots.filter(Boolean).map((o) => (o as Option).id))
  const rest = top.filter((o) => !placed.has(o.id))
  return slots.map((o) => o ?? rest.shift() ?? null)
}
