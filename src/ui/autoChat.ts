import { useAgent, type AgentState } from '../stores/agent'
import { panelOpen, ui, useUi } from '../stores/ui'
import { hasMore, isRichReply } from './markdownText'

/**
 * Brings up the chat (the one place Wendy's words live in full) when she has
 * more to say than her line above the cards can hold:
 * - From home: a web search, or a reply that goes past its first sentence
 *   (what would be "Read all"), or one whose first sentence alone is cut off.
 *   A one-sentence reply that fits stays in her line.
 * - Inside anything else (a task, a list, the Vault, the finds): as soon as she
 *   talks, since those panels don't show her words at all.
 * If the user closes the chat during that turn it stays closed until the next
 * one, and a panel Wendy opens herself mid-turn (card.open…) is left alone.
 */
export function startAutoChat(): () => void {
  let dismissedTurn: string | null = null
  /** The turn in which Wendy opened a panel herself (her screen action wins). */
  let shownByWendy: string | null = null

  const turnFrom = (a: AgentState) => a.turnId ?? (a.awaitingTurn ? `pending:${a.turnAt}` : null)
  const turnOf = () => turnFrom(useAgent.getState())

  /** From home, unless this turn's chat was closed by the user or given over to Wendy's panel. */
  const openFromHome = (turn: string) => {
    const u = useUi.getState()
    if (turn === dismissedTurn || turn === shownByWendy || u.chatOpen || panelOpen(u)) return
    ui.openChat()
  }

  const offUi = useUi.subscribe((s, p) => {
    const turn = turnOf()
    if (!turn) return
    // Her reply got cut off in the line.
    if (s.lineOverflow && !p.lineOverflow) return openFromHome(turn)
    if (!p.chatOpen || s.chatOpen) return
    // The chat gave way mid-turn: to a panel, that was Wendy pointing at something;
    // to home, that was the user closing it.
    if (panelOpen(s)) shownByWendy = turn
    else dismissedTurn = turn
  })

  const offAgent = useAgent.subscribe((s, p) => {
    // A reply that lands whole (no streaming) arrives as the turn ends.
    const last = s.messages.at(-1)
    const ended = turnFrom(p)
    if (last && last !== p.messages.at(-1) && last.role === 'assistant' && ended && hasMore(last.text))
      return openFromHome(turnFrom(s) ?? ended)

    const turn = turnFrom(s)
    if (!turn || turn === dismissedTurn) return
    const u = useUi.getState()
    if (u.chatOpen) return
    if (panelOpen(u)) {
      if (turn !== shownByWendy && s.streaming) ui.openChat()
      return
    }
    const searching = s.phase === 'tool' && /search|browse|web|fetch/i.test(s.toolName ?? '')
    if (searching || (s.streaming && (isRichReply(s.streaming) || hasMore(s.streaming)))) ui.openChat()
  })

  return () => {
    offUi()
    offAgent()
  }
}
