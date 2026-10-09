import { useAgent } from '../stores/agent'
import { ui, useUi } from '../stores/ui'
import { isRichReply } from './markdownText'

/**
 * Opens Wendy's full reader (box 4 expanded) on its own when an answer won't
 * fit the card: a web search, or a reply that turns out long, structured or
 * illustrated. If the user closes the reader during that turn, it stays closed
 * until the next one.
 */
export function startAutoReader(): () => void {
  let dismissedTurn: string | null = null

  const offUi = useUi.subscribe((s, p) => {
    const turn = useAgent.getState().turnId
    if (p.reader && !s.reader && turn) dismissedTurn = turn
  })

  const offAgent = useAgent.subscribe((s) => {
    const turn = s.turnId
    if (!turn || turn === dismissedTurn) return
    const u = useUi.getState()
    if (u.reader || u.chatOpen) return
    const searching = s.phase === 'tool' && /search|browse|web|fetch/i.test(s.toolName ?? '')
    if (searching || (s.streaming && isRichReply(s.streaming))) ui.openReader()
  })

  return () => {
    offUi()
    offAgent()
  }
}
