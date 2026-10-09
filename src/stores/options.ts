import { create } from 'zustand'
import type { Option } from '../options/types'

interface Entry {
  wendy: Option[]
  loading: boolean
}

export interface OptionsState {
  /** Wendy-written options per context key. */
  byKey: Record<string, Entry>
  /** Options Wendy pushed via the options.set ui_action; win until the context changes. */
  pushed: { key: string; options: Option[] } | null
  listening: boolean
  interim: string
}

export const useOptionsStore = create<OptionsState>(() => ({
  byKey: {},
  pushed: null,
  listening: false,
  interim: '',
}))

const set = useOptionsStore.setState

export const optionsStore = {
  setWendy: (key: string, wendy: Option[]) => set((s) => ({ byKey: { ...s.byKey, [key]: { wendy, loading: false } } })),
  setLoading: (key: string, loading: boolean) =>
    set((s) => ({ byKey: { ...s.byKey, [key]: { wendy: s.byKey[key]?.wendy ?? [], loading } } })),
  push: (key: string, options: Option[]) => set({ pushed: { key, options } }),
  clearPushed: () => set({ pushed: null }),
  voice: (listening: boolean, interim = '') => set({ listening, interim }),
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** App housekeeping (the reminders offer): useful, but never worth outranking real options. */
const TRAILING = new Set(['enablePush', 'snoozePush', 'installHelp'])

/**
 * Merge order: local *acts* first (instant, concrete actions like Done/Tomorrow
 * are anchors), then Wendy's pushed options, then Wendy-written, then local says,
 * with housekeeping chips always last. Case-insensitive dedupe on label and on
 * what is said; capped.
 */
export function mergeOptions(local: Option[], wendy: Option[], pushed: Option[], max = 6): Option[] {
  const trailing = local.filter((o) => o.act && TRAILING.has(o.act.type))
  const acts = local.filter((o) => (o.act && !TRAILING.has(o.act.type)) || (o.pin && !o.act))
  const says = local.filter((o) => !o.act && !o.pin)
  const seen = new Set<string>()
  const out: Option[] = []
  const room = max - trailing.length
  for (const o of [...acts, ...pushed, ...wendy, ...says]) {
    const keys = [norm(o.label), o.say ? norm(o.say) : '']
    if (keys.some((k) => k && seen.has(k))) continue
    keys.forEach((k) => k && seen.add(k))
    out.push(o)
    if (out.length >= room) break
  }
  return [...out, ...trailing]
}
