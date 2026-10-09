import type { CalendarOccurrence, Goal, Notification, Task } from '../aelora/protocol'
import type { LocalAct } from '../options/types'
import type { EntitiesState } from '../stores/entities'
import type { ItemKind } from '../stores/ui'

/** One thing to tackle, from any domain, with how urgent it is and why. */
export interface PriorityItem {
  /** `${kind}:${id}` */
  key: string
  kind: ItemKind
  id: string
  title: string
  /** Short factual line: "in 12 min · Studio", "due today · 25m". */
  meta: string
  /** Why it matters now (local wording; Wendy may replace it). */
  why: string
  /** 0–100. */
  score: number
  /** 0–1, drives the urgency colour. */
  urgency: number
  /** One-tap quick action on the card. */
  primary?: { label: string; act: LocalAct }
}

type Entities = Pick<EntitiesState, 'tasks' | 'goals' | 'events' | 'notifications'>

const MIN = 60_000
const DAY = 86_400_000

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function localDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00`) - Date.parse(`${a}T00:00`)) / DAY)

function untilText(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `in ${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `in ${h}h ${m % 60}m` : `in ${h}h`
}

function agoText(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

const item = (p: Omit<PriorityItem, 'key' | 'urgency'>): PriorityItem => ({
  ...p,
  key: `${p.kind}:${p.id}`,
  urgency: Math.max(0, Math.min(1, p.score / 100)),
})

function scoreEvent(e: CalendarOccurrence, now: number): PriorityItem | null {
  const start = Date.parse(e.start_time)
  const end = Date.parse(e.end_time)
  if (end <= now) return null
  const where = e.location ? ` · ${e.location}` : ''
  if (!e.all_day && start <= now) {
    return item({
      kind: 'event',
      id: e.id,
      title: e.title,
      meta: `now · until ${clockTime(e.end_time)}${where}`,
      why: 'Happening now',
      score: 100,
    })
  }
  const mins = (start - now) / MIN
  if (mins <= 180) {
    return item({
      kind: 'event',
      id: e.id,
      title: e.title,
      meta: `${untilText(start - now)}${where}`,
      why: mins <= 30 ? 'Starting soon' : 'Coming up',
      score: Math.round(95 - mins / 3),
    })
  }
  if (localDate(start) === localDate(now)) {
    return item({
      kind: 'event',
      id: e.id,
      title: e.title,
      meta: `${clockTime(e.start_time)}${where}`,
      why: 'Later today',
      score: 40,
    })
  }
  return null
}

function scoreTask(t: Task, now: number): PriorityItem | null {
  if (t.status === 'done' || t.status === 'skipped') return null
  const today = localDate(now)
  const est = t.estimated_minutes ? ` · ${t.estimated_minutes}m` : ''
  const active = t.status === 'committed' || t.status === 'in_progress'
  const primary = { label: 'Done', act: { type: 'complete' as const, id: t.id } }
  const base = { kind: 'task' as const, id: t.id, title: t.title, primary }
  if (!t.due_date)
    return item({
      ...base,
      meta: `no date${est}`,
      why: active ? 'In progress' : 'Whenever you can',
      score: active ? 25 : 15,
    })
  const days = daysBetween(t.due_date, today)
  if (days > 0) {
    return item({
      ...base,
      meta: `due ${days === 1 ? 'yesterday' : `${days} days ago`}${est}`,
      why: `${days} day${days === 1 ? '' : 's'} overdue`,
      score: Math.min(94, 80 + days * 2),
    })
  }
  if (days === 0)
    return item({
      ...base,
      meta: `due today${est}`,
      why: active ? 'In progress, due today' : 'Due today',
      score: active ? 70 : 60,
    })
  if (days === -1) return item({ ...base, meta: `due tomorrow${est}`, why: 'Due tomorrow', score: 30 })
  return null
}

function scoreNotification(n: Notification, now: number): PriorityItem | null {
  if (n.read_at) return null
  const sent = Date.parse(n.sent_at ?? n.created_at)
  if (n.scheduled_for && !n.sent_at && Date.parse(n.scheduled_for) > now) return null
  const fresh = now - sent < 60 * MIN
  return item({
    kind: 'notification',
    id: n.id,
    title: n.title,
    meta: `${n.body ? `${n.body.slice(0, 48)} · ` : ''}${agoText(now - sent)}`,
    why: fresh ? 'New reminder' : 'Still unread',
    score: fresh ? 72 : 50,
    primary: { label: 'Got it', act: { type: 'markRead', id: n.id } },
  })
}

function scoreGoal(g: Goal, tasks: Task[]): PriorityItem | null {
  if (g.status !== 'active' || (g.timeframe !== 'day' && g.timeframe !== 'week')) return null
  const linked = tasks.filter((t) => t.goal_id === g.id && t.status !== 'skipped')
  const done = linked.filter((t) => t.status === 'done').length
  const progress = linked.length ? done / linked.length : 0
  if (progress >= 0.3) return null
  return item({
    kind: 'goal',
    id: g.id,
    title: g.title,
    meta: `${done}/${linked.length} done · this ${g.timeframe}`,
    why: `Behind this ${g.timeframe}`,
    score: 35,
  })
}

/** Every candidate, best first. Pure: same inputs, same order. */
export function scoreItems(e: Entities, now: number): PriorityItem[] {
  const tasks = Object.values(e.tasks)
  const all = [
    ...Object.values(e.events).map((x) => scoreEvent(x, now)),
    ...tasks.map((x) => scoreTask(x, now)),
    ...Object.values(e.notifications).map((x) => scoreNotification(x, now)),
    ...Object.values(e.goals).map((x) => scoreGoal(x, tasks)),
  ].filter((x): x is PriorityItem => x !== null)
  // A recurring series expands into many occurrences; keep the soonest one per id.
  const seen = new Set<string>()
  return all
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)))
}

/** Top `n` with variety: no more than two of one kind. */
export function topWithVariety(items: PriorityItem[], n = 3): PriorityItem[] {
  const out: PriorityItem[] = []
  const counts: Partial<Record<ItemKind, number>> = {}
  for (const it of items) {
    if ((counts[it.kind] ?? 0) >= 2) continue
    out.push(it)
    counts[it.kind] = (counts[it.kind] ?? 0) + 1
    if (out.length === n) return out
  }
  // Not enough variety available: fill with whatever is left, in order.
  for (const it of items) {
    if (out.length === n) break
    if (!out.includes(it)) out.push(it)
  }
  return out
}
