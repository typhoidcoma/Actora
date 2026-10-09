import { beforeEach, describe, expect, it } from 'vitest'
import type { Notification, Task } from '../aelora/protocol'
import { runUiAction } from '../aelora/router'
import { isStale, mergeOptions, useOptionsStore, type OptionHistory } from '../stores/options'
import { useUi } from '../stores/ui'
import { localOptions, type Snapshot } from './local'
import { feasible, parseWendyOptions } from './wendy'
import { actOption, sayOption } from './types'

const NOW = new Date(2026, 9, 8, 18, 0).getTime()

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  status: 'todo',
  goal_id: null,
  vault_id: null,
  due_date: '2026-10-08',
  estimated_minutes: null,
  committed_at: null,
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
})

const note = (id: string, read = false): Notification => ({
  id,
  origin_type: 'wendy',
  title: `Note ${id}`,
  body: null,
  scheduled_for: null,
  sent_at: '2026-10-08T17:00:00Z',
  read_at: read ? '2026-10-08T17:30:00Z' : null,
  created_at: '2026-10-08T17:00:00Z',
})

function snap(over: Partial<Snapshot['entities']> = {}, agent: Partial<Snapshot['agent']> = {}): Snapshot {
  return {
    entities: { tasks: {}, goals: {}, events: {}, notifications: {}, ...over },
    agent: { messages: [], line: 'greeting', notice: null, turnId: null, awaitingTurn: false, ...agent },
    push: { status: 'unsupported', snoozedUntil: null },
    now: NOW,
  }
}

describe('local options', () => {
  it('home: catch-up when unread, a start chip for the top task, always plan my day', () => {
    const labels = localOptions('home', snap({ tasks: { a: task('a') }, notifications: { n: note('n') } })).map(
      (o) => o.label,
    )
    expect(labels).toContain('Catch me up')
    expect(labels).toContain('Start: Task a')
    expect(labels).toContain('Plan my day')
  })

  it('home: a reminder in the line gets answer chips, with Got it as a direct action', () => {
    const opts = localOptions(
      'home',
      snap({}, { line: 'notice', notice: { notificationId: 'n1', title: 'Stretch', body: null } }),
    )
    expect(opts[0]).toMatchObject({ label: 'Got it', act: { type: 'markRead', id: 'n1' } })
  })

  it('task item: Done and Tomorrow are acts with the right ids and date', () => {
    const opts = localOptions('item:task:a', snap({ tasks: { a: task('a') } }))
    expect(opts[0].act).toEqual({ type: 'complete', id: 'a' })
    expect(opts[1].act).toEqual({ type: 'reschedule', id: 'a', due: '2026-10-09' })
  })

  it('offers reminders only after Wendy has spoken and when not snoozed', () => {
    const s = snap()
    s.push = { status: 'off', snoozedUntil: null }
    expect(localOptions('home', s).some((o) => o.act?.type === 'enablePush')).toBe(false)
    s.agent = { ...s.agent, messages: [{ id: 'm', role: 'assistant', text: 'hi' }] }
    expect(localOptions('home', s).some((o) => o.act?.type === 'enablePush')).toBe(true)
    s.push = { status: 'off', snoozedUntil: NOW + 1000 }
    expect(localOptions('home', s).some((o) => o.act?.type === 'enablePush')).toBe(false)
  })

  it('tasks tile suggests moving overdue only when something is overdue', () => {
    const has = (s: Snapshot) => localOptions('tile:tasks', s).some((o) => o.label.startsWith('Move overdue'))
    expect(has(snap({ tasks: { a: task('a') } }))).toBe(false)
    expect(has(snap({ tasks: { a: task('a', { due_date: '2026-10-01' }) } }))).toBe(true)
  })
})

describe('card-aware home options', () => {
  it('names each card, in rank order, phrased for its kind, and pins them ahead of Wendy', () => {
    const s = snap()
    s.cards = [
      { kind: 'event', id: 'e', title: 'Standup', urgency: 0.95 },
      { kind: 'task', id: 't', title: 'Write the report', urgency: 0.6 },
      { kind: 'notification', id: 'n', title: 'Stretch', urgency: 0.7 },
    ]
    const opts = localOptions('home', s)
    // Each card's best idea in rank order, then the day, then each card's alternates.
    expect(opts.map((o) => o.label).slice(0, 4)).toEqual([
      'Prep: Standup',
      'Start: Write the report',
      'Got it: Stretch',
      'Plan my day',
    ])
    // Wendy's (written for this moment) lead; the top card and direct actions keep their places right after.
    const merged = mergeOptions(opts, [sayOption('Generic idea', 'x', 'wendy')], []).map((o) => o.label)
    expect(merged.slice(0, 3)).toEqual(['Generic idea', 'Prep: Standup', 'Got it: Stretch'])
  })
})

describe('merge', () => {
  it("leads with Wendy's (pushed, then generated), keeps room for local acts, then local says; dedupes and caps", () => {
    const local = [sayOption('Plan my day'), actOption('Done', { type: 'complete', id: 'a' })]
    const wendy = [sayOption('plan my day!', 'Plan my day', 'wendy'), sayOption('Quick wins', 'x', 'wendy')]
    const pushed = [sayOption('From Wendy', 'y', 'pushed')]
    const out = mergeOptions(local, wendy, pushed, 3).map((o) => o.label)
    expect(out).toEqual(['From Wendy', 'plan my day!', 'Done'])
    const offer = actOption('Let Wendy remind me', { type: 'enablePush' })
    const withOffer = mergeOptions([offer, ...local], wendy, [], 3).map((o) => o.label)
    expect(withOffer).toEqual(['plan my day!', 'Done', 'Let Wendy remind me'])
  })

  it('puts what answers her question first, even with five ideas and two actions in play', () => {
    const local = [
      actOption('Done', { type: 'complete', id: 'a' }),
      actOption('Tomorrow', { type: 'reschedule', id: 'a', due: 'x' }),
      sayOption('Plan my day'),
    ]
    const wendy = ['Yes, move it', 'Keep it today', 'Break it down', 'Why this?', 'Something else'].map((l) =>
      sayOption(l, l, 'wendy'),
    )
    expect(mergeOptions(local, wendy, []).map((o) => o.label)).toEqual([
      'Yes, move it',
      'Keep it today',
      'Break it down',
      'Done',
      'Tomorrow',
      'Why this?',
    ])
  })
})

describe('parseWendyOptions', () => {
  it('accepts the object form, a bare array and fenced JSON', () => {
    expect(parseWendyOptions('{"options":[{"label":"Yes","say":"Yes please"}]}')).toHaveLength(1)
    expect(parseWendyOptions('[{"label":"No"}]')[0].say).toBe('No')
    expect(parseWendyOptions('```json\n{"options":[{"label":"Ok","say":"Ok"}]}\n```')).toHaveLength(1)
  })

  it('rejects junk, over-long labels and duplicates; caps at five', () => {
    expect(parseWendyOptions('not json')).toEqual([])
    expect(parseWendyOptions('{"options":"nope"}')).toEqual([])
    const long = 'x'.repeat(40)
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}` }))
    expect(
      parseWendyOptions(JSON.stringify({ options: [{ label: long }, { label: 'A' }, { label: 'a' }] })),
    ).toHaveLength(1)
    expect(parseWendyOptions(JSON.stringify({ options: many }))).toHaveLength(5)
  })
})

describe('Wendy-driven UI actions', () => {
  beforeEach(() => {
    useUi.setState({ focus: null, chatOpen: false, selected: null, theme: 'auto', keyboardOpen: false })
    useOptionsStore.setState({ pushed: null })
  })

  it('item.focus opens the item in its own panel', () => {
    runUiAction('item.focus', { kind: 'event', id: 'e1' })
    expect(useUi.getState()).toMatchObject({ focus: null, selected: { kind: 'event', id: 'e1' } })
  })

  it('options.set pushes sanitized options for the current context', () => {
    runUiAction('item.focus', { kind: 'task', id: 't1' })
    // A lone valid option isn't a choice: ignored.
    runUiAction('options.set', { options: [{ label: 'Yes', say: 'Yes please' }, { nope: 1 }, { label: '' }] })
    expect(useOptionsStore.getState().pushed).toBeNull()
    runUiAction('options.set', { options: [{ label: 'Yes', say: 'Yes please' }, { label: 'No' }, { nope: 1 }] })
    const pushed = useOptionsStore.getState().pushed
    expect(pushed?.key).toBe('item:task:t1')
    expect(pushed?.options.map((o) => o.say)).toEqual(['Yes please', 'No'])
  })

  it('theme.set accepts only known modes', () => {
    runUiAction('theme.set', { mode: 'dusk' })
    expect(useUi.getState().theme).toBe('dusk')
    runUiAction('theme.set', { mode: 'neon' })
    expect(useUi.getState().theme).toBe('dusk')
  })
})

describe('freshness', () => {
  const h = (over: Partial<OptionHistory> = {}): OptionHistory => ({ tapped: [], shown: {}, ...over })

  it('rests an option that was just tapped, or keeps being ignored', () => {
    const plan = sayOption('Plan my day')
    expect(isStale(plan, h(), NOW)).toBe(false)
    expect(isStale(plan, h({ tapped: [{ label: 'Plan my day', say: 'Plan my day', at: NOW - 60_000 }] }), NOW)).toBe(
      true,
    )
    expect(isStale(plan, h({ tapped: [{ label: 'Plan my day', say: 'Plan my day', at: NOW - 3_600_000 }] }), NOW)).toBe(
      false,
    )
    expect(isStale(plan, h({ shown: { 'plan my day': { n: 4, lastAt: NOW - 60_000 } } }), NOW)).toBe(true)
    expect(isStale(plan, h({ shown: { 'plan my day': { n: 4, lastAt: NOW - 3 * 3_600_000 } } }), NOW)).toBe(false)
  })

  it('drops stale suggestions but keeps direct actions and never empties the rail', () => {
    const local = [actOption('Done', { type: 'complete', id: 'a' }), sayOption('Plan my day')]
    const wendy = [sayOption('Old idea', 'x', 'wendy'), sayOption('Fresh idea', 'y', 'wendy')]
    const stale = (o: { label: string }) => o.label === 'Old idea' || o.label === 'Done'
    expect(mergeOptions(local, wendy, [], 6, stale).map((o) => o.label)).toEqual(['Fresh idea', 'Done', 'Plan my day'])
    const allStale = () => true
    expect(mergeOptions([], wendy, [], 6, allStale).length).toBe(2)
  })

  it("filters out things Wendy can't do", () => {
    expect(feasible(sayOption('Book a table', 'Book us a table for two'))).toBe(false)
    expect(feasible(sayOption('Text Sam', 'Text Sam that I am late'))).toBe(false)
    expect(feasible(sayOption('Find a ramen spot', 'Find me a good ramen spot nearby'))).toBe(true)
  })

  it('answers her question while her own options load', () => {
    const asked = snap({}, { line: 'reply', messages: [{ id: '1', role: 'assistant', text: 'Want me to move it?' }] })
    expect(localOptions('home', asked).map((o) => o.label)).toEqual(['Yes please', 'Not right now'])
    const told = snap({}, { line: 'reply', messages: [{ id: '1', role: 'assistant', text: 'Done, it is moved.' }] })
    expect(localOptions('home', told).map((o) => o.label)).toEqual(['Tell me more', 'What else?'])
  })
})
