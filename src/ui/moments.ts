import { say } from '../options/run'
import { useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { toast } from '../stores/toast'

const LEAD_MS = 10 * 60_000

/**
 * A nudge shortly before each event (about 10 minutes), wherever the user is,
 * even when the event isn't one of the top cards: "Standup in 9 min · Prep me".
 * Once per occurrence, all-day events skipped, never while Wendy is mid-turn.
 */
export function startMoments(): () => void {
  const nudged = new Set<string>()
  const check = () => {
    const a = useAgent.getState()
    if (a.connection !== 'open' || a.turnId || a.awaitingTurn) return
    const now = Date.now()
    for (const e of Object.values(useEntities.getState().events)) {
      if (e.all_day) continue
      const start = Date.parse(e.start_time)
      const key = `${e.id}@${e.occurrence_start ?? e.start_time}`
      if (nudged.has(key) || start - now > LEAD_MS || start - now < 60_000) continue
      nudged.add(key)
      const mins = Math.max(1, Math.round((start - now) / 60_000))
      toast.show(`${e.title} in ${mins} min`, {
        ms: 30_000,
        action: { label: 'Prep me', run: () => void say(`Help me prep for "${e.title}".`) },
      })
      return // one at a time
    }
  }
  const t = setInterval(check, 30_000)
  check()
  return () => clearInterval(t)
}
