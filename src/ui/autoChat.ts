import { useAgent } from '../stores/agent'
import { panelOpen, ui, useUi } from '../stores/ui'
import { isRichReply } from './markdownText'

/**
 * Brings up the chat (the one place Wendy's words live in full) when she has
 * more to say than her line above the cards can hold:
 * - From home: a web search, or a reply that turns out long, structured or
 *   illustrated. A short reply stays in her line.
 * - Inside anything else (a task, a list, the Vault, the finds): as soon as she
 *   talks, since those panels don't show her words at all.
 * If the user closes the chat during that turn it stays closed until the next
 * one, and a panel Wendy opens herself mid-turn (card.open…) is left alone.
 */
export function startAutoChat(): () => void {
  let dismissedTurn: string | null = null
  /** The turn in which Wendy opened a panel herself (her screen action wins). */
  let shownByWendy: string | null = null

  const turnOf = () => {
    const a = useAgent.getState()
    return a.turnId ?? (a.awaitingTurn ? `pending:${a.turnAt}` : null)
  }

  const offUi = useUi.subscribe((s, p) => {
    const turn = turnOf()
    if (!turn || !p.chatOpen || s.chatOpen) return
    // The chat gave way mid-turn: to a panel, that was Wendy pointing at something;
    // to home, that was the user closing it.
    if (panelOpen(s)) shownByWendy = turn
    else dismissedTurn = turn
  })

  const offAgent = useAgent.subscribe((s) => {
    const turn = turnOf()
    if (!turn || turn === dismissedTurn) return
    const u = useUi.getState()
    if (u.chatOpen) return
    if (panelOpen(u)) {
      if (turn !== shownByWendy && s.streaming) ui.openChat()
      return
    }
    const searching = s.phase === 'tool' && /search|browse|web|fetch/i.test(s.toolName ?? '')
    if (searching || (s.streaming && isRichReply(s.streaming))) ui.openChat()
  })

  return () => {
    offUi()
    offAgent()
  }
}
