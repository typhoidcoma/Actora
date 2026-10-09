import { useEntities } from '../stores/entities'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CalendarOccurrence, Notification, Task } from '../aelora/protocol'
import { runUiAction } from '../aelora/router'
import { mergePriorities, usePriorityStore } from '../stores/priority'
import { useUi } from '../stores/ui'
import { parseRanking } from './rank'
import { scoreItems, topWithVariety } from './score'

const NOW = new Date(2026, 9, 8, 12, 0).getTime()
const iso = (minsFromNow: number) => new Date(NOW + minsFromNow * 60_000).toISOString()

const task = (id: string, due: string | null, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  status: 'todo',
  goal_id: null,
  vault_id: null,
  due_date: due,
  estimated_minutes: null,
  committed_at: null,
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
})
const event = (id: string, startMin: number, durMin = 30): CalendarOccurrence => ({
  id,
  title: `Event ${id}`,
  start_time: iso(startMin),
  end_time: iso(startMin + durMin),
})
const note = (id: string, minsAgo: number, read = false): Notification => ({
  id,
  origin_type: 'wendy',
  title: `Note ${id}`,
  body: null,
  scheduled_for: null,
  sent_at: iso(-minsAgo),
  read_at: read ? iso(0) : null,
  created_at: iso(-minsAgo),
})

const ents = (o: { tasks?: Task[]; events?: CalendarOccurrence[]; notes?: Notification[] }) => ({
  tasks: Object.fromEntries((o.tasks ?? []).map((t) => [t.id, t])),
  events: Object.fromEntries((o.events ?? []).map((e) => [e.id, e])),
  notifications: Object.fromEntries((o.notes ?? []).map((n) => [n.id, n])),
  goals: {},
})

describe('scoreItems', () => {
  it('ranks a live meeting over an overdue task over a fresh reminder over today', () => {
    const order = scoreItems(
      ents({
        tasks: [
          task('today', '2026-10-08'),
          task('late', '2026-10-05'),
          task('done', '2026-10-01', { status: 'done' }),
        ],
        events: [event('live', -10), event('past', -120, 30)],
        notes: [note('fresh', 5), note('read', 5, true)],
      }),
      NOW,
    ).map((i) => i.key)
    expect(order).toEqual(['event:live', 'task:late', 'notification:fresh', 'task:today'])
  })

  it('scores an event 15 minutes out higher than one 2 hours out', () => {
    const [a, b] = scoreItems(ents({ events: [event('later', 120), event('soon', 15)] }), NOW)
    expect(a.key).toBe('event:soon')
    expect(a.score).toBeGreaterThan(b.score)
    expect(a.meta).toMatch(/in 15 min/)
  })

  it('caps one kind at two in the top three when there is variety', () => {
    const items = scoreItems(
      ents({
        tasks: [task('a', '2026-10-01'), task('b', '2026-10-02'), task('c', '2026-10-03')],
        notes: [note('n', 90)],
      }),
      NOW,
    )
    expect(topWithVariety(items).map((i) => i.kind)).toEqual(['task', 'task', 'notification'])
  })
})

describe('ranking', () => {
  const known = new Set(['task:a', 'event:b', 'notification:c'])

  it('keeps known keys in order, dedupes, and drops over-long whys', () => {
    const r = parseRanking(
      JSON.stringify({
        top: [
          { key: 'event:b', why: 'Leave in 5' },
          { key: 'nope:x' },
          { key: 'event:b' },
          { key: 'task:a', why: 'x'.repeat(90) },
        ],
      }),
      known,
    )
    expect(r).toEqual([
      { key: 'event:b', why: 'Leave in 5' },
      { key: 'task:a', why: undefined },
    ])
    expect(parseRanking('garbage', known)).toEqual([])
  })

  it('merges pushed > Wendy > local, drops vanished items, fills from local', () => {
    const local = scoreItems(
      ents({ tasks: [task('a', '2026-10-05')], events: [event('b', 20)], notes: [note('c', 5)] }),
      NOW,
    )
    const merged = mergePriorities(
      local,
      [{ key: 'notification:c', why: 'Ping back' }, { key: 'task:gone' }],
      [{ key: 'task:a' }],
    )
    expect(merged.map((m) => m.key)).toEqual(['task:a', 'notification:c', 'event:b'])
    expect(merged[1]).toMatchObject({ why: 'Ping back', whyFrom: 'wendy' })
    expect(merged[0].whyFrom).toBe('local')
  })
})

describe('Wendy actions', () => {
  beforeEach(() => {
    usePriorityStore.setState({ wendy: null, pushed: null })
    useUi.setState({ focus: null, chatOpen: false, selected: null, reader: false, theme: 'auto', keyboardOpen: false })
  })

  it('priorities.set stores a sanitized ranking', () => {
    useEntities.setState({ tasks: { a: { id: 'a', title: 'A', status: 'todo' } as never } })
    runUiAction('priorities.set', {
      items: [
        { kind: 'task', id: 'a', why: 'First '.repeat(20) },
        { kind: 'bogus', id: 'x' },
        { kind: 'task', id: 'not-here' },
      ],
    })
    // Unknown kinds and ids that don't exist are dropped; why is capped at 60.
    expect(usePriorityStore.getState().pushed?.entries).toEqual([
      { key: 'task:a', why: 'First '.repeat(20).trim().slice(0, 60) },
    ])
  })

  it('card.open opens the item panel (no list); reader.open shows the answer', () => {
    runUiAction('card.open', { kind: 'event', id: 'e1' })
    expect(useUi.getState()).toMatchObject({ selected: { kind: 'event', id: 'e1' }, focus: null })
    runUiAction('reader.open', {})
    expect(useUi.getState()).toMatchObject({ reader: true, selected: null })
  })
})

describe('auto reader heuristics', () => {
  it('flags big questions and rich replies', async () => {
    const { isLargeQuestion, isRichReply } = await import('../ui/markdownText')
    expect(isLargeQuestion('Plan my day')).toBe(false)
    expect(isLargeQuestion('Can you compare the three best running routes near me for tomorrow?')).toBe(true)
    expect(isRichReply('Sure, done.')).toBe(false)
    expect(isRichReply('Options:\n- a\n- b\n- c')).toBe(true)
    expect(isRichReply('![x](https://e.com/a.png)')).toBe(true)
    expect(isRichReply('| a | b |\n|---|---|')).toBe(true)
  })
})
