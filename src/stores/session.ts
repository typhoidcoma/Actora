import { create } from 'zustand'

/**
 * A focus session (Aelora's sessions): started from a "Focus" pill or by Wendy's
 * start_session tool, shown as a timer chip until it's ended. The anchor is
 * what the user is focusing on.
 */
interface FocusSession {
  id: string
  started_at: string
  ended_at: string | null
  anchor_response: string | null
}

interface SessionState {
  active: FocusSession | null
}

export const useSession = create<SessionState>(() => ({ active: null }))

const isSession = (v: unknown): v is FocusSession =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as FocusSession).id === 'string' &&
  typeof (v as FocusSession).started_at === 'string'

export const sessions = {
  /** session.list: the one still running (if any) is the active one. */
  setList(list: unknown) {
    const all = Array.isArray(list) ? list.filter(isSession) : []
    const open = all.filter((s) => !s.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
    useSession.setState({ active: open ?? null })
  },
  /** A started / ended / updated session (reply or event). */
  apply(s: unknown) {
    if (!isSession(s)) return
    const cur = useSession.getState().active
    if (s.ended_at) {
      if (cur?.id === s.id) useSession.setState({ active: null })
    } else useSession.setState({ active: s })
  },
  clear: () => useSession.setState({ active: null }),
}
