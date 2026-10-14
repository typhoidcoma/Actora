import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { isStale, mergeOptions, pushedShowsIn, useOptionsStore } from '../stores/options'
import { usePush } from '../stores/push'
import { useSession } from '../stores/session'
import { approvalOptions, usePending, waiting } from '../stores/pending'
import { contextKeyOf, useUi } from '../stores/ui'
import { useNow } from '../ui/tiles/data'
import { useFinds } from '../finds/finds'
import { usePriorities } from '../priority/usePriorities'
import { localOptions } from './local'
import type { Option } from './types'

const EMPTY: Option[] = []

export function useContextKey(): string {
  return useUi(useShallow((s) => contextKeyOf(s)))
}

/** The options for a context: instant local ones, refined by the agent's, overridden by any it pushed. */
export function useOptions(key: string): { options: Option[]; loading: boolean } {
  const entities = useEntities(
    useShallow((s) => ({ tasks: s.tasks, goals: s.goals, events: s.events, notifications: s.notifications })),
  )
  const agent = useAgent(
    useShallow((s) => ({
      messages: s.messages,
      line: s.line,
      notice: s.notice,
      turnId: s.turnId,
      awaitingTurn: s.awaitingTurn,
      botName: s.botName,
    })),
  )
  const push = usePush(useShallow((s) => ({ status: s.status, snoozedUntil: s.snoozedUntil })))
  const now = useNow(60_000)
  const cards = usePriorities()
  const finds = useFinds((s) => s.items)
  const focusing = useSession((s) => s.active !== null)

  const local = useMemo(
    () => localOptions(key, { entities, agent, push, now, cards, finds, focusing }),
    [key, entities, agent, push, now, cards, finds, focusing],
  )
  const agentOptions = useOptionsStore((s) => s.byKey[key]?.agent ?? EMPTY)
  const loading = useOptionsStore((s) => s.byKey[key]?.loading ?? false)
  const pushed = useOptionsStore((s) => (s.pushed && pushedShowsIn(s.pushed.key, key) ? s.pushed.options : EMPTY))
  // Anything waiting for the user's OK leads, wherever they are.
  const approval = usePending(useShallow((s) => waiting(s.items)[0]))

  // Judged against history as it was when this set formed, so an option doesn't
  // vanish mid-look just because it was counted as shown.
  const options = useMemo(() => {
    const history = useOptionsStore.getState().history
    return mergeOptions(local, agentOptions, [...approvalOptions(approval), ...pushed], 6, (o) =>
      isStale(o, history, now),
    )
  }, [local, agentOptions, pushed, now, approval])
  return { options, loading }
}
