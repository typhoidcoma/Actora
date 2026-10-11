import { create } from 'zustand'
import { topWithVariety, type PriorityItem } from '../priority/score'

export interface RankEntry {
  key: string
  why?: string
}

interface PriorityState {
  /** The agent's re-ranking (from /api/llm), for the candidate set it was made for. */
  agent: RankEntry[] | null
  /** Ranking the agent pushed with priorities.set; wins until it expires. */
  pushed: { entries: RankEntry[]; until: number } | null
}

export const usePriorityStore = create<PriorityState>(() => ({ agent: null, pushed: null }))

export const priorityStore = {
  setAgent: (agent: RankEntry[] | null) => usePriorityStore.setState({ agent }),
  push: (entries: RankEntry[], ttlMs = 30 * 60_000) =>
    usePriorityStore.setState({ pushed: { entries, until: Date.now() + ttlMs } }),
  clearPushed: () => usePriorityStore.setState({ pushed: null }),
}

export type RankedItem = PriorityItem & { whyFrom: 'local' | 'agent' }

/**
 * Top 3 to show: The agent's pushed ranking, then her suggested ranking, then the
 * local score. Keys that no longer exist (done, read, past) drop out at once,
 * and local items fill the gaps.
 */
export function mergePriorities(
  local: PriorityItem[],
  agent: RankEntry[] | null,
  pushed: RankEntry[] | null,
  n = 3,
): RankedItem[] {
  const byKey = new Map(local.map((i) => [i.key, i]))
  const out: RankedItem[] = []
  const used = new Set<string>()
  for (const entry of [...(pushed ?? []), ...(agent ?? [])]) {
    const it = byKey.get(entry.key)
    if (!it || used.has(it.key)) continue
    used.add(it.key)
    out.push({ ...it, why: entry.why?.trim() || it.why, whyFrom: entry.why?.trim() ? 'agent' : 'local' })
    if (out.length === n) return out
  }
  for (const it of topWithVariety(
    local.filter((i) => !used.has(i.key)),
    n - out.length,
  )) {
    out.push({ ...it, whyFrom: 'local' })
  }
  return out
}
