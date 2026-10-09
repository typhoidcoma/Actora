import { create } from 'zustand'

/**
 * What Wendy remembers about the user (Aelora's vault: the unified memory
 * facts + vault store). Loaded when the Vault opens; kept live by
 * `vault:*` broadcasts, including the ones her own remember/forget tools send.
 */
export interface VaultEntry {
  id: string
  content: string
  category: string | null
  confidence: number | null
  source: string | null
  created_at: string
  updated_at?: string
}

/** Aelora's 12 categories, in the order the panel shows them, with human names. */
export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'identity', label: 'Who you are' },
  { id: 'preference', label: 'Likes and dislikes' },
  { id: 'routine', label: 'Routines' },
  { id: 'relationship', label: 'People' },
  { id: 'value', label: 'What matters to you' },
  { id: 'intention', label: 'Intentions' },
  { id: 'skill', label: 'Skills' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'constraint', label: 'Limits' },
  { id: 'upcoming', label: 'Coming up' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'context', label: 'Context' },
]

interface VaultState {
  entries: Record<string, VaultEntry>
  status: 'idle' | 'loading' | 'ready' | 'error'
}

export const useVault = create<VaultState>(() => ({ entries: {}, status: 'idle' }))

export const vault = {
  reset: () => useVault.setState({ entries: {}, status: 'idle' }),
  loading: () => useVault.setState((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' })),
  failed: () => useVault.setState((s) => ({ status: s.status === 'ready' ? 'ready' : 'error' })),
  set: (list: VaultEntry[]) =>
    useVault.setState({ entries: Object.fromEntries(list.map((e) => [e.id, e])), status: 'ready' }),
  upsert: (e: VaultEntry) => useVault.setState((s) => ({ entries: { ...s.entries, [e.id]: e } })),
  remove: (id: string) =>
    useVault.setState((s) => {
      if (!(id in s.entries)) return s
      const entries = { ...s.entries }
      delete entries[id]
      return { entries }
    }),
}

/** Entries grouped by category in display order; legacy/unknown categories land in Context. */
export function grouped(
  entries: Record<string, VaultEntry>,
): Array<{ id: string; label: string; items: VaultEntry[] }> {
  const known = new Set(CATEGORIES.map((c) => c.id))
  const by = new Map<string, VaultEntry[]>()
  for (const e of Object.values(entries)) {
    const cat = e.category && known.has(e.category) ? e.category : 'context'
    by.set(cat, [...(by.get(cat) ?? []), e])
  }
  return CATEGORIES.filter((c) => by.has(c.id)).map((c) => ({
    ...c,
    items: by.get(c.id)!.sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at)),
  }))
}
