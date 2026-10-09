import { useEffect, useMemo, useState } from 'react'
import type { CalendarOccurrence, Goal, Notification, Task } from '../../aelora/protocol'
import { useEntities } from '../../stores/entities'
import { useUi, type ItemKind } from '../../stores/ui'

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isOpen = (t: Task) => t.status !== 'done' && t.status !== 'skipped'

interface TaskSummary {
  open: Task[]
  done: Task[]
  todayTotal: number
  todayDone: number
  hydrated: boolean
}

export function useTasks(): TaskSummary {
  const tasks = useEntities((s) => s.tasks)
  const hydrated = useEntities((s) => s.hydrated.tasks)
  return useMemo(() => {
    const today = todayStr()
    const all = Object.values(tasks)
    const byDue = (a: Task, b: Task) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at)
    const open = all.filter(isOpen).sort(byDue)
    const done = all
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    const todays = all.filter((t) => t.due_date !== null && t.due_date <= today && (isOpen(t) || t.due_date === today))
    return {
      open,
      done,
      todayTotal: todays.length,
      todayDone: todays.filter((t) => t.status === 'done').length,
      hydrated,
    }
  }, [tasks, hydrated])
}

export interface GoalRow {
  goal: Goal
  done: number
  total: number
  progress: number
}

export function useGoals(): {
  active: GoalRow[]
  paused: GoalRow[]
  completed: GoalRow[]
  overall: number
  hydrated: boolean
} {
  const goals = useEntities((s) => s.goals)
  const tasks = useEntities((s) => s.tasks)
  const hydrated = useEntities((s) => s.hydrated.goals)
  return useMemo(() => {
    const counts = new Map<string, { done: number; total: number }>()
    for (const t of Object.values(tasks)) {
      if (!t.goal_id || t.status === 'skipped') continue
      const c = counts.get(t.goal_id) ?? { done: 0, total: 0 }
      c.total++
      if (t.status === 'done') c.done++
      counts.set(t.goal_id, c)
    }
    const order = ['day', 'week', 'month', 'semester', 'year']
    const rows = (status: Goal['status']) =>
      Object.values(goals)
        .filter((g) => g.status === status)
        .map((goal) => {
          const c = counts.get(goal.id) ?? { done: 0, total: 0 }
          return { goal, ...c, progress: c.total ? c.done / c.total : 0 }
        })
        .sort((a, b) => order.indexOf(a.goal.timeframe ?? 'year') - order.indexOf(b.goal.timeframe ?? 'year'))
    const active = rows('active')
    const overall = active.length ? active.reduce((s, r) => s + r.progress, 0) / active.length : 0
    return { active, paused: rows('paused'), completed: rows('completed'), overall, hydrated }
  }, [goals, tasks, hydrated])
}

/**
 * Timed events that overlap another one: occurrence key → the other event's
 * title. All-day events don't clash (they're context, not appointments).
 */
export function clashes(events: CalendarOccurrence[]): Map<string, string> {
  const timed = events
    .filter((e) => !e.all_day)
    .map((e) => ({ e, s: Date.parse(e.start_time), end: Date.parse(e.end_time) }))
    .sort((a, b) => a.s - b.s)
  const out = new Map<string, string>()
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j].s < timed[i].end; j++) {
      const a = timed[i].e
      const b = timed[j].e
      if (a.id === b.id) continue
      const key = (x: CalendarOccurrence) => `${x.id}@${x.occurrence_start ?? ''}`
      if (!out.has(key(a))) out.set(key(a), b.title)
      if (!out.has(key(b))) out.set(key(b), a.title)
    }
  }
  return out
}

export function useAgenda(now: number): {
  upcoming: CalendarOccurrence[]
  current: CalendarOccurrence | null
  hydrated: boolean
} {
  const events = useEntities((s) => s.events)
  const hydrated = useEntities((s) => s.hydrated.events)
  return useMemo(() => {
    const live = Object.values(events)
      .filter((e) => Date.parse(e.end_time) > now)
      .sort((a, b) => Date.parse(a.occurrence_start ?? a.start_time) - Date.parse(b.occurrence_start ?? b.start_time))
    const current = live.find((e) => !e.all_day && Date.parse(e.start_time) <= now) ?? null
    return { upcoming: live, current, hydrated }
  }, [events, now, hydrated])
}

export function useInbox(now: number): {
  items: Notification[]
  unread: number
  /** Reminders set for later (not yet delivered), soonest first. */
  upcoming: Notification[]
  hydrated: boolean
} {
  const notes = useEntities((s) => s.notifications)
  const hydrated = useEntities((s) => s.hydrated.notifications)
  return useMemo(() => {
    const items = Object.values(notes)
      .filter((n) => n.sent_at || !n.scheduled_for || Date.parse(n.scheduled_for) <= now)
      .sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at))
    const upcoming = Object.values(notes)
      .filter((n) => !n.sent_at && n.scheduled_for && Date.parse(n.scheduled_for) > now)
      .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!))
    return { items, unread: items.filter((n) => !n.read_at).length, upcoming, hydrated }
  }, [notes, hydrated, now])
}

/** Is this row the selected one (its options are on the rail)? */
export function useSelected(kind: ItemKind, id: string, occurrence?: string): boolean {
  return useUi(
    (s) =>
      s.selected?.kind === kind &&
      s.selected.id === id &&
      (occurrence === undefined || (s.selected.occurrence ?? undefined) === occurrence),
  )
}
