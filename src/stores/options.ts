import { create } from 'zustand'
import type { Option } from '../options/types'

interface Entry {
  agent: Option[]
  loading: boolean
}

interface OptionsState {
  /** Agent-written options per context key. */
  byKey: Record<string, Entry>
  /** Options the agent pushed via the options.set ui_action; win until the context changes. */
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
  setAgent: (key: string, agent: Option[]) => set((s) => ({ byKey: { ...s.byKey, [key]: { agent, loading: false } } })),
  setLoading: (key: string, loading: boolean) =>
    set((s) => ({ byKey: { ...s.byKey, [key]: { agent: s.byKey[key]?.agent ?? [], loading } } })),
  push: (key: string, options: Option[]) => set({ pushed: { key, options } }),
  clearPushed: () => set({ pushed: null }),
  /** A different user: forget what the last one was shown and tapped (and their generated options). */
  resetHistory: () => set({ history: { tapped: [], shown: {} }, byKey: {}, pushed: null }),
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

/**
 * App housekeeping (the reminders offer) and ways to wave something off (a
 * check-in's "Not now"): never worth outranking real options, but always there, last.
 */
const TRAILING = new Set(['enablePush', 'snoozePush', 'installHelp', 'checkinLater'])

/**
 * Most relevant first. The agent's options are written for this exact moment (an
 * answer to what she just asked, the item on screen), so they lead: what she
 * pushed with options.set, then her generated ones in the order she ranked them.
 * Concrete local actions (Done, Got it, the top card) keep up to two places right
 * after her best three, so they're never squeezed out. Generic local fallbacks
 * fill what's left, and housekeeping chips are always last. Case-insensitive
 * dedupe on label and on what is said; capped.
 */
export function mergeOptions(
  local: Option[],
  agent: Option[],
  pushed: Option[],
  max = 6,
  stale: (o: Option) => boolean = () => false,
): Option[] {
  const isTrailing = (o: Option) => !!o.act && TRAILING.has(o.act.type)
  const trailing = [...pushed.filter(isTrailing), ...local.filter(isTrailing)]
  pushed = pushed.filter((o) => !isTrailing(o))
  const acts = local.filter((o) => !o.alt && ((o.act && !TRAILING.has(o.act.type)) || (o.pin && !o.act)))
  const says = local.filter((o) => !o.pin && (o.alt ? !(o.act && TRAILING.has(o.act.type)) : !o.act))
  const room = max - trailing.length
  const seen = new Set<string>()
  const out: Option[] = []
  const pick = (pool: Option[], limit = room) => {
    for (const o of pool) {
      if (out.length >= Math.min(limit, room)) break
      const keys = [norm(o.label), o.say ? norm(o.say) : '']
      if (keys.some((k) => k && seen.has(k))) continue
      keys.forEach((k) => k && seen.add(k))
      out.push(o)
    }
  }
  // Concrete actions and what the agent pushed always count; suggestions that went
  // stale sit out, unless that would leave the rail nearly empty.
  const keep = (o: Option) => !!o.act || o.source === 'pushed' || !stale(o)
  // Her own answers to what she just asked (pushed) are the whole conversation for now:
  // generated ideas and suggestions wait until it's answered (concrete card actions still show).
  const answering = pushed.filter((o) => o.say).length >= 2
  if (answering) {
    agent = []
    says.length = 0
  }
  // Direct answers to her question lead, wherever they came from and however late.
  const answers = [...pushed, ...agent].filter((o) => o.answer)
  if (answers.filter((o) => o.say).length >= 2) says.length = 0
  const lead = [...answers, ...[...pushed, ...agent].filter((o) => !o.answer)].filter(keep)
  const anchors = acts.filter(keep)
  const reserve = Math.min(anchors.length, 2)
  pick(lead.slice(0, Math.max(pushed.length, answers.length, 3)), room - reserve)
  pick(anchors)
  pick(lead)
  pick(says.filter(keep))
  if (out.length < Math.min(3, room)) pick([...pushed, ...agent, ...acts, ...says].filter((o) => !keep(o)))
  return [...out, ...trailing]
}
