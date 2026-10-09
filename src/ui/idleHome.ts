import { useAgent } from '../stores/agent'
import { useOptionsStore } from '../stores/options'
import { panelOpen, ui, useUi } from '../stores/ui'

/** Left alone this long with something open, the app eases back to the home view. */
export const IDLE_HOME_MS = 2 * 60_000

const away = () => {
  const u = useUi.getState()
  return panelOpen(u) || u.chatOpen
}

/**
 * Returns to home after a while with no taps, clicks, keys or scrolling, so the
 * app is back at a glance-able state when the user next looks. Never while
 * Wendy is working or talking, the mic is listening, or the keyboard is up:
 * the timer restarts once those end.
 */
export function startIdleHome(ms = IDLE_HOME_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const busy = () => {
    const a = useAgent.getState()
    return (
      a.awaitingTurn ||
      a.turnId !== null ||
      a.streaming !== null ||
      useOptionsStore.getState().listening ||
      useUi.getState().keyboardOpen
    )
  }

  const arm = () => {
    clearTimeout(timer)
    if (!away()) return
    timer = setTimeout(() => {
      if (busy()) return arm()
      if (away()) ui.closeAll()
    }, ms)
  }

  const events = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const
  for (const e of events) window.addEventListener(e, arm, { passive: true })
  // Opening something (by tap or by Wendy) starts the clock; finishing a turn restarts it.
  const offUi = useUi.subscribe((s, p) => s !== p && arm())
  const offAgent = useAgent.subscribe((s, p) => {
    if ((p.turnId || p.awaitingTurn) && !s.turnId && !s.awaitingTurn) arm()
  })
  arm()

  return () => {
    clearTimeout(timer)
    for (const e of events) window.removeEventListener(e, arm)
    offUi()
    offAgent()
  }
}
