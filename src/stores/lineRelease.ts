import { agent, useAgent } from './agent'
import { useEntities } from './entities'
import { contextKeyOf, useUi } from './ui'

/**
 * When her line lets go of what it's showing. Both apps run it (2D Stage, 3D Live):
 * - Moving somewhere new returns the line from a finished reply to her greeting.
 * - Leaving home after her welcome has been said marks it seen, so it doesn't
 *   greet again each time a window closes (a check-in waits for its answer).
 * - A reminder stays until it's acknowledged: "Got it", or read anywhere (the
 *   inbox, "Mark all read", another device).
 */
export function startLineRelease(): () => void {
  const offUi = useUi.subscribe((s, p) => {
    const a = useAgent.getState()
    const transient = a.line === 'reply' || a.line === 'message'
    if (contextKeyOf(s) !== contextKeyOf(p) && transient && !a.turnId && !a.awaitingTurn) agent.showGreeting()
    const g = a.greeting
    if (contextKeyOf(p) === 'home' && contextKeyOf(s) !== 'home' && g.text && !g.streaming && !g.checkin && !g.spent)
      useAgent.setState({ greeting: { ...g, spent: true } })
  })
  const offRead = useEntities.subscribe((s) => {
    const a = useAgent.getState()
    if (a.line === 'notice' && a.notice && s.notifications[a.notice.notificationId]?.read_at) agent.showGreeting()
  })
  return () => {
    offUi()
    offRead()
  }
}
