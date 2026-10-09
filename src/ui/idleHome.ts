import { useAgent } from '../stores/agent'
import { useOptionsStore } from '../stores/options'
import { panelOpen, ui, useUi } from '../stores/ui'

/** A conversation with Wendy (the chat) left alone this long goes home. */
const CHAT_IDLE_MS = 10_000
/** Any other panel (lists, items, finds, the Vault) left alone this long goes home. */
const PANEL_IDLE_MS = 2 * 60_000
/** The longest a quiet conversation waits for reading time. */
const READ_CAP_MS = 2 * 60_000

const away = () => {
  const u = useUi.getState()
  return panelOpen(u) || u.chatOpen
}
const inConversation = () => {
  const u = useUi.getState()
  return u.chatOpen
}

/**
 * Eases back to home when nothing is happening, so the app always looks ready
 * for Wendy to be proactive: 10 s after a conversation goes quiet, 2 min for
 * other panels. Taps, keys, scrolling (inside panels too), moving the pointer
 * and selecting text all count as activity. Never while Wendy is working or
 * talking, the mic is listening, the keyboard is up, or text is selected:
 * the clock restarts once those end.
 */
export function startIdleHome(chatMs = CHAT_IDLE_MS, panelMs = PANEL_IDLE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const busy = () => {
    const a = useAgent.getState()
    const selecting = typeof window.getSelection === 'function' && !!window.getSelection()?.toString()
    return (
      a.awaitingTurn ||
      a.turnId !== null ||
      a.streaming !== null ||
      useOptionsStore.getState().listening ||
      useUi.getState().keyboardOpen ||
      selecting
    )
  }

  // A conversation stays up at least as long as it takes to read her last answer
  // (about 200 words a minute), so a long one isn't whisked away mid-read.
  const readMs = () => {
    const last = useAgent.getState().messages.findLast((m) => m.role === 'assistant')
    const words = last ? last.text.split(/\s+/).filter(Boolean).length : 0
    return Math.min(Math.max(chatMs, (words / 200) * 60_000), Math.max(chatMs, READ_CAP_MS))
  }

  const arm = () => {
    clearTimeout(timer)
    if (!away()) return
    timer = setTimeout(
      () => {
        if (busy()) return arm()
        if (away()) ui.closeAll()
      },
      inConversation() ? readMs() : panelMs,
    )
  }

  // Pointer movement fires constantly; re-arming at most every 300 ms is plenty.
  let lastMove = 0
  const onMove = () => {
    const now = Date.now()
    if (now - lastMove < 300) return
    lastMove = now
    arm()
  }

  const events = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const
  for (const e of events) window.addEventListener(e, arm, { passive: true })
  window.addEventListener('pointermove', onMove, { passive: true })
  // Panels scroll inside themselves; capture catches those scrolls too.
  window.addEventListener('scroll', onMove, { passive: true, capture: true })
  document.addEventListener('selectionchange', onMove)
  // Opening something (by tap or by Wendy) starts the clock; finishing a turn restarts it.
  const offUi = useUi.subscribe((s, p) => s !== p && arm())
  const offAgent = useAgent.subscribe((s, p) => {
    if ((p.turnId || p.awaitingTurn) && !s.turnId && !s.awaitingTurn) arm()
  })
  arm()

  return () => {
    clearTimeout(timer)
    for (const e of events) window.removeEventListener(e, arm)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('scroll', onMove, { capture: true })
    document.removeEventListener('selectionchange', onMove)
    offUi()
    offAgent()
  }
}
