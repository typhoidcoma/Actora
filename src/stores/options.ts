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
  /** Short-term memory of what was offered and tapped, so options don't go stale on repeat. */
  history: OptionHistory
}

export interface OptionHistory {
  /** Recently tapped, newest last. */
  tapped: Array<{ label: string; say: string | null; at: number }>
  /** How often each label has been on screen (counted at most once a minute), keyed by normalised label. */
  shown: Record<string, { n: number; lastAt: number }>
}

export const useOptionsStore = create<OptionsState>(() => ({
  byKey: {},
  pushed: null,
  listening: false,
  interim: '',
  history: { tapped: [], shown: {} },
}))

const set = useOptionsStore.setState

export const optionsStore = {
  setWendy: (key: string, wendy: Option[]) => set((s) => ({ byKey: { ...s.byKey, [key]: { wendy, loading: false } } })),
  setLoading: (key: string, loading: boolean) =>
    set((s) => ({ byKey: { ...s.byKey, [key]: { wendy: s.byKey[key]?.wendy ?? [], loading } } })),
  push: (key: string, options: Option[]) => set({ pushed: { key, options } }),
  clearPushed: () => set({ pushed: null }),
  voice: (listening: boolean, interim = '') => set({ listening, interim }),
  noteTapped: (o: Option) =>
    set((s) => ({
      history: {
        ...s.history,
        tapped: [...s.history.tapped, { label: o.label, say: o.say ?? null, at: Date.now() }].slice(-20),
      },
    })),
  noteShown: (options: Option[]) =>
    set((s) => {
      const now = Date.now()
      const shown = { ...s.history.shown }
      for (const o of options) {
        const k = norm(o.label)
        const prev = shown[k]
        // A different moment (2h later) starts the count again.
        if (!prev || now - prev.lastAt > SHOWN_RESET_MS) shown[k] = { n: 1, lastAt: now }
        else if (now - prev.lastAt > 60_000) shown[k] = { n: prev.n + 1, lastAt: now }
      }
      return { history: { ...s.history, shown } }
    }),
}

const TAPPED_REST_MS = 30 * 60_000
const SHOWN_RESET_MS = 2 * 3_600_000
/** Offered this many separate times without a tap: the user doesn't want it; let it rest. */
const IGNORED_AFTER = 4

/** Tapped in the last half hour, or offered again and again and never taken. */
export function isStale(o: Option, h: OptionHistory, now = Date.now()): boolean {
  const label = norm(o.label)
  const say = o.say ? norm(o.say) : null
  const recent = h.tapped.filter((t) => now - t.at < TAPPED_REST_MS)
  if (recent.some((t) => norm(t.label) === label || (say && t.say && norm(t.say) === say))) return true
  const seen = h.shown[label]
  if (!seen || seen.n < IGNORED_AFTER || now - seen.lastAt > SHOWN_RESET_MS) return false
  return !h.tapped.some((t) => norm(t.label) === label && t.at > now - SHOWN_RESET_MS)
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
export function mergeOptions(
  local: Option[],
  wendy: Option[],
  pushed: Option[],
  max = 6,
  stale: (o: Option) => boolean = () => false,
): Option[] {
  const trailing = local.filter((o) => o.act && TRAILING.has(o.act.type))
  const acts = local.filter((o) => !o.alt && ((o.act && !TRAILING.has(o.act.type)) || (o.pin && !o.act)))
  const says = local.filter((o) => !o.pin && (o.alt ? !(o.act && TRAILING.has(o.act.type)) : !o.act))
  const room = max - trailing.length
  const pick = (pool: Option[], out: Option[], seen: Set<string>) => {
    for (const o of pool) {
      if (out.length >= room) break
      const keys = [norm(o.label), o.say ? norm(o.say) : '']
      if (keys.some((k) => k && seen.has(k))) continue
      keys.forEach((k) => k && seen.add(k))
      out.push(o)
    }
  }
  // Concrete actions (Done, Got it) and what Wendy pushed always count; suggestions
  // that went stale sit out, unless that would leave the rail nearly empty.
  const ordered = [...acts, ...pushed, ...wendy, ...says]
  const keep = (o: Option) => !!o.act || o.source === 'pushed' || !stale(o)
  const out: Option[] = []
  const seen = new Set<string>()
  pick(ordered.filter(keep), out, seen)
  if (out.length < Math.min(3, room))
    pick(
      ordered.filter((o) => !keep(o)),
      out,
      seen,
    )
  return [...out, ...trailing]
}
