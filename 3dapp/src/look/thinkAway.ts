import { useAgent } from '@actora/stores/agent'
import { panelOpen, ui, useUi } from '@actora/stores/ui'
import { markSteppedBack } from './longAnswers'

/** With no words from her this long after you send, the chat steps back to the room. */
export const THINK_MS = 2500

/** You're typing the next thing: don't pull the chat out from under you. */
function typing(): boolean {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  return !!el && 'value' in el && typeof el.value === 'string' && el.value.trim() !== ''
}

/**
 * A long think is better watched than waited on: if you sent something from the
 * chat and she's still thinking (searching, looking things up) a few seconds
 * later, the chat steps back so you see her at it in the room. Her answer then
 * plays out there and the chat comes back for it (longAnswers.ts). Once per
 * turn; not while a panel is up or you're typing.
 */
export function startThinkAway(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let done = false
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }

  const off = useAgent.subscribe((s, p) => {
    if (s.awaitingTurn && !p.awaitingTurn) {
      done = false
      stop()
      timer = setInterval(() => {
        const a = useAgent.getState()
        const thinking = (a.awaitingTurn || a.turnId !== null) && !a.streaming
        if (!thinking || done) return stop()
        if (a.turnAt === null || Date.now() - a.turnAt < THINK_MS) return
        const u = useUi.getState()
        if (!u.chatOpen || panelOpen(u) || typing()) return
        done = true
        stop()
        markSteppedBack()
        ui.closeChat()
      }, 200)
    }
  })
  return () => {
    off()
    stop()
  }
}
