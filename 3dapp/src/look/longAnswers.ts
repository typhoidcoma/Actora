import { useAgent } from '@actora/stores/agent'
import { panelOpen, ui, useUi } from '@actora/stores/ui'
import { herOffset } from './her'

/** A turn this long (or with this many steps: searches, lookups) gets the close-up chat. */
const LONG_MS = 6000
const MANY_STEPS = 2
/** After her answer is in, how long to wait at most for her to be back at her spot. */
const SETTLE_MAX_MS = 5000

/** This turn was watched from the room because the chat stepped back for it (thinkAway.ts): bring the chat back after. */
let steppedBack = false
export const markSteppedBack = (): void => {
  steppedBack = true
}

/**
 * After a long search or a long think, her answer is worth reading in full, so
 * the chat (the close-up, camera on her) opens. But only once the turn is over:
 * her thinking animations play out first, she walks back to her spot as the
 * answer comes in (its first sentence over her head), and then the camera comes
 * in on the whole answer. Quick answers stay on the caption. Only from home, once
 * per turn; a new turn or anything opened meanwhile cancels it.
 */
export function startLongAnswers(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  const cancel = () => {
    clearInterval(timer)
    timer = undefined
  }

  const off = useAgent.subscribe((s, p) => {
    // A new turn starting: whatever was waiting is moot.
    if (s.awaitingTurn && !p.awaitingTurn) {
      cancel()
      steppedBack = false
    }
    // The turn just finished (her last words are in).
    const finished = p.turnId !== null && s.turnId === null && !s.streaming
    if (!finished) return
    const long = steppedBack || (s.turnAt !== null && Date.now() - s.turnAt >= LONG_MS) || s.steps.length >= MANY_STEPS
    steppedBack = false
    if (!long) return
    cancel()
    const started = Date.now()
    timer = setInterval(() => {
      const u = useUi.getState()
      if (u.chatOpen || panelOpen(u)) return cancel()
      const home = Math.hypot(herOffset.x, herOffset.z) < 0.05
      if (home || Date.now() - started > SETTLE_MAX_MS) {
        cancel()
        ui.openChat()
      }
    }, 100)
  })
  return () => {
    off()
    cancel()
  }
}
