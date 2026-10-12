import { useAgent } from '@actora/stores/agent'
import { panelOpen, ui, useUi } from '@actora/stores/ui'

/** A turn this long (or with this many steps: searches, lookups) gets the close-up chat. */
const LONG_MS = 6000
const MANY_STEPS = 2

/**
 * After a long search or a long think, her answer is worth reading in full:
 * when its first words arrive, the chat opens (the close-up, camera on her) so
 * it can be read as she writes it. Quick answers stay on the caption over her
 * head. Only from home, and once per turn (closing it isn't overridden).
 */
export function startLongAnswers(): () => void {
  return useAgent.subscribe((s, p) => {
    if (!s.streaming || p.streaming) return
    const long = (s.turnAt !== null && Date.now() - s.turnAt >= LONG_MS) || s.steps.length >= MANY_STEPS
    const u = useUi.getState()
    if (long && !u.chatOpen && !panelOpen(u)) ui.openChat()
  })
}
