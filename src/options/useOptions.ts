import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { mergeOptions, useOptionsStore } from '../stores/options'
import { usePush } from '../stores/push'
import { contextKeyOf, useUi } from '../stores/ui'
import { useNow } from '../ui/tiles/data'
import { localOptions } from './local'
import type { Option } from './types'

const EMPTY: Option[] = []

export function useContextKey(): string {
  return useUi(useShallow((s) => contextKeyOf(s)))
}

/** The options for a context: instant local ones, refined by Wendy's, overridden by any she pushed. */
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
    })),
  )
  const push = usePush(useShallow((s) => ({ status: s.status, snoozedUntil: s.snoozedUntil })))
  const now = useNow(60_000)

  const local = useMemo(() => localOptions(key, { entities, agent, push, now }), [key, entities, agent, push, now])
  const wendy = useOptionsStore((s) => s.byKey[key]?.wendy ?? EMPTY)
  const loading = useOptionsStore((s) => s.byKey[key]?.loading ?? false)
  const pushed = useOptionsStore((s) => (s.pushed?.key === key ? s.pushed.options : EMPTY))

  const options = useMemo(() => mergeOptions(local, wendy, pushed), [local, wendy, pushed])
  return { options, loading }
}
