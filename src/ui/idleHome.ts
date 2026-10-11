import { useAgent } from '../stores/agent'
import { useOptionsStore } from '../stores/options'
import { panelOpen, ui, useUi } from '../stores/ui'

/** A conversation with the agent (the chat) left alone this long goes home. */
const CHAT_IDLE_MS = 30_000
/** Any other panel (lists, items, finds, the Vault) left alone this long goes home. */
const PANEL_IDLE_MS = 6_000
/** The longest a quiet chat or panel waits for reading time. */
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
 * for the agent to be proactive: 30 s after a conversation goes quiet, 6 s for
 * other panels, either stretched to give what's on screen time to be read.
 * Taps, keys, scrolling (inside panels too), moving the pointer
 * and selecting text all count as activity. Never while the agent is working or
 * talking, the mic is listening, the keyboard is up, or text is selected:
 * the clock restarts once those end.
 */
export function startIdleHome(chatMs = CHAT_IDLE_MS, panelMs = PANEL_IDLE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const busy = () => {
    const a = useAgent.getState()
    const selecting = typeof window.getSelection === 'function' && !!window.getSelection()?.toString()
    // Writing in the chat's message box (or any field): never whisk it away mid-thought.
    const el = typeof document !== 'undefined' ? document.activeElement : null
    const typing =
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !!(el as HTMLInputElement).value?.trim()
    return (
      a.awaitingTurn ||
      a.turnId !== null ||
      a.streaming !== null ||
      useOptionsStore.getState().listening ||
      useUi.getState().keyboardOpen ||
      selecting ||
      typing
    )
  }

  // Stays up at least as long as it takes to read (about 200 words a minute), so
  // a long answer or brief isn't whisked away mid-read.
  const readMs = (base: number, text: string) => {
    const words = text.split(/\s+/).filter(Boolean).length
    return Math.min(Math.max(base, (words / 200) * 60_000), Math.max(base, READ_CAP_MS))
  }
  // The chat: her last answer. A panel: whatever it shows (a task's brief, a list, a find).
  const waitMs = () => {
    if (inConversation()) {
      const last = useAgent.getState().messages.findLast((m) => m.role === 'assistant')
      return readMs(chatMs, last?.text ?? '')
    }
    const panel = typeof document !== 'undefined' ? document.querySelector?.('[data-panel]') : null
    return readMs(panelMs, panel?.textContent ?? '')
  }

  const arm = () => {
    clearTimeout(timer)
    if (!away()) return
    timer = setTimeout(() => {
      if (busy()) return arm()
      if (away()) ui.closeAll()
    }, waitMs())
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
  // Opening something (by tap or by the agent) starts the clock; finishing a turn restarts it.
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
