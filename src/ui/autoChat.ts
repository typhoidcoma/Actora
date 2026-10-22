import { useAgent, type AgentState } from '../stores/agent'
import { phone } from '../stores/phone'
import { panelOpen, ui, useUi } from '../stores/ui'
import { hasMore, isRichReply } from './markdownText'

/**
 * Brings up the chat (the one place the agent's words live in full) when she has
 * more to say than her line above the cards can hold:
 * - From home: a web search, or a reply that goes past its first sentence
 *   (what would be "Read all"), or one whose first sentence alone is cut off.
 *   A one-sentence reply that fits stays in her line.
 * - Inside anything else (a task, a list, the Vault, the finds; never People): as soon as she
 *   talks, since those panels don't show her words at all.
 * If the user closes the chat during that turn it stays closed until the next
 * one, and a panel the agent opens herself mid-turn (card.open…) is left alone
 * (on a wide screen the chat opens beside it instead).
 */
export function startAutoChat(): () => void {
  let dismissedTurn: string | null = null
  /** The turn in which the agent opened a panel herself (her screen action wins). */
  let shownByAgent: string | null = null

  const turnFrom = (a: AgentState) => a.turnId ?? (a.awaitingTurn ? `pending:${a.turnAt}` : null)
  const turnOf = () => turnFrom(useAgent.getState())

  /** From home, unless this turn's chat was closed by the user or given over to the agent's panel. */
  const openFromHome = (turn: string) => {
    const u = useUi.getState()
    if (turn === dismissedTurn || turn === shownByAgent || u.chatOpen || panelOpen(u)) return
    ui.openChat()
  }

  const offUi = useUi.subscribe((s, p) => {
    const turn = turnOf()
    if (!turn) return
    // Her reply got cut off in the line.
    if (s.lineOverflow && !p.lineOverflow) return openFromHome(turn)
    if (!p.chatOpen || s.chatOpen) return
    // The chat gave way mid-turn: to a panel, that was the agent pointing at something;
    // to home, that was the user closing it.
    if (panelOpen(s)) shownByAgent = turn
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
    // In People you're with friends: her words wait in her line and the chat, not on top of them.
    if (u.people) return
    if (panelOpen(u)) {
      // Wide screens: the chat opens beside it, so even a panel she opened herself stays in view.
      if ((turn !== shownByAgent || phone.split()) && s.streaming) ui.openChat()
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
