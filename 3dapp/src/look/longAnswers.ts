import { useAgent, workSteps, type AgentState } from '@actora/stores/agent'
import { panelOpen, ui, useUi } from '@actora/stores/ui'

/** A turn this long (or with this many steps: searches, lookups) gets the close-up chat. */
const LONG_MS = 6000
const MANY_STEPS = 2

/** This turn was watched from the room because the chat stepped back for it (thinkAway.ts): bring the chat back for it. */
let steppedBack = false
export const markSteppedBack = (): void => {
  steppedBack = true
}

const isLong = (s: AgentState) =>
  steppedBack || (s.turnAt !== null && Date.now() - s.turnAt >= LONG_MS) || workSteps(s.steps).length >= MANY_STEPS

/**
 * After a long search or a long think, her answer is worth reading in full, so
 * the chat (the close-up, camera on her) opens. Reading comes first: it opens
 * the moment her first words arrive, never held back for an animation or her
 * walk home. A turn that only turns out long later (more steps after she
 * started talking) opens it when it ends. Quick answers stay on her line. Only
 * from home, once per turn; anything opened meanwhile wins.
 */
export function startLongAnswers(): () => void {
  let opened = false
  const open = () => {
    opened = true
    steppedBack = false
    const u = useUi.getState()
    if (!u.chatOpen && !panelOpen(u)) ui.openChat()
  }

  return useAgent.subscribe((s, p) => {
    if (s.awaitingTurn && !p.awaitingTurn) {
      opened = false
      steppedBack = false
    }
    if (opened) return
    const firstWords = !!s.streaming && !p.streaming && s.turnId !== null
    const finished = p.turnId !== null && s.turnId === null
    if ((firstWords || finished) && isLong(s)) open()
    else if (finished) steppedBack = false
  })
}
