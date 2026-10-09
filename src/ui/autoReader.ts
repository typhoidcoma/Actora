import { useAgent } from '../stores/agent'
import { panelOpen, ui, useUi } from '../stores/ui'
import { isRichReply } from './markdownText'

/**
 * Where Wendy's words go while she's answering, so the user never loses them:
 * - From home, a big answer (a web search, or a reply that turns out long,
 *   structured or illustrated) opens her full reader.
 * - Inside anything else (a task, a list, the Vault, the finds), the moment she
 *   talks the main chat comes up: her words aren't shown in those panels.
 * Either way, if the user closes it during that turn it stays closed until the
 * next one, and a panel Wendy opens herself mid-turn (card.open…) is left alone.
 */
export function startAutoReader(): () => void {
  let dismissedTurn: string | null = null
  /** The turn in which Wendy opened a panel herself (her screen action wins). */
  let shownByWendy: string | null = null

  const turnOf = () => {
    const a = useAgent.getState()
    return a.turnId ?? (a.awaitingTurn ? `pending:${a.turnAt}` : null)
  }

  const offUi = useUi.subscribe((s, p) => {
    const turn = turnOf()
    if (!turn) return
    if ((p.reader && !s.reader) || (p.chatOpen && !s.chatOpen && !panelOpen(s))) dismissedTurn = turn
    // Chat (or reader) gave way to a panel mid-turn: that was Wendy pointing at something.
    if ((p.chatOpen || p.reader) && panelOpen(s) && !s.reader && !s.chatOpen) shownByWendy = turn
  })

  const offAgent = useAgent.subscribe((s) => {
    const turn = turnOf()
    if (!turn || turn === dismissedTurn) return
    const u = useUi.getState()
    if (u.reader || u.chatOpen) return
    if (panelOpen(u)) {
      if (turn !== shownByWendy && s.streaming) ui.openChat()
      return
    }
    const searching = s.phase === 'tool' && /search|browse|web|fetch/i.test(s.toolName ?? '')
    if (searching || (s.streaming && isRichReply(s.streaming))) ui.openReader()
  })

  return () => {
    offUi()
    offAgent()
  }
}
