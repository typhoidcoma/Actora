import { beforeEach, describe, expect, it } from 'vitest'
import type { Notification, Task } from '../aelora/protocol'
import { runUiAction } from '../aelora/router'
import { isStale, mergeOptions, pushedShowsIn, useOptionsStore, type OptionHistory } from '../stores/options'
import { stopPeek } from '../ui/peek'
import { useEntities } from '../stores/entities'
import { useUi } from '../stores/ui'
import { localOptions, type Snapshot } from './local'
import { feasible, parseAgentOptions } from './agentOptions'
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

  it('task item: Done, Start, Tomorrow and Pick a day are direct acts', () => {
    const opts = localOptions('item:task:a', snap({ tasks: { a: task('a') } }))
    const act = (type: string) => opts.find((o) => o.act?.type === type)?.act
    expect(opts[0].act).toEqual({ type: 'complete', id: 'a' })
    expect(act('startTask')).toEqual({ type: 'startTask', id: 'a' })
    expect(act('reschedule')).toEqual({ type: 'reschedule', id: 'a', due: '2026-10-09' })
    expect(act('pickDay')).toEqual({ type: 'pickDay', id: 'a' })
    // Overdue: "Today" instead of "Tomorrow".
    const late = localOptions('item:task:b', snap({ tasks: { b: task('b', { due_date: '2026-10-01' }) } }))
    expect(late.find((o) => o.act?.type === 'reschedule')).toMatchObject({ label: 'Today' })
    // Done: it can be reopened.
    const done = localOptions('item:task:c', snap({ tasks: { c: task('c', { status: 'done' }) } }))
    expect(done[0].act).toEqual({ type: 'reopen', id: 'c' })
  })

  it('snooze lands at sensible times', async () => {
    const { snoozeTime } = await import('./run')
    const at = new Date(2026, 9, 8, 14, 0)
    expect(snoozeTime('hour', at).getHours()).toBe(15)
    expect(snoozeTime('tonight', at).getHours()).toBe(19)
    expect(snoozeTime('tonight', new Date(2026, 9, 8, 18, 50)).getHours()).toBe(20)
    const t = snoozeTime('tomorrow', at)
    expect([t.getDate(), t.getHours()]).toEqual([9, 9])
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

/** The day's moment pills (time-of-day dependent), set aside where a test is about the cards. */
const MOMENT = new Set(['Wrap up my day', 'Focus on this'])

describe('card-aware home options', () => {
  it("the top card still leads; the day's moments come right after it", () => {
    const s = snap()
    s.cards = [{ kind: 'event', id: 'e', title: 'Standup', urgency: 0.95 }]
    const labels = localOptions('home', s).map((o) => o.label)
    expect(labels[0]).toBe('Prep: Standup')
    expect(labels.slice(1, 3)).toEqual(['Wrap up my day', 'Focus on this'])
    s.focusing = true
    expect(localOptions('home', s).map((o) => o.label)).not.toContain('Focus on this')
  })

  it('offers to move overdue work to today, in one tap', () => {
    const s = snap({ tasks: { a: task('a', { due_date: '2026-10-01' }), b: task('b', { due_date: '2026-10-02' }) } })
    const move = localOptions('home', s).find((o) => o.act?.type === 'moveOverdue')
    expect(move).toMatchObject({ label: 'Move 2 overdue to today', act: { type: 'moveOverdue', today: '2026-10-08' } })
  })

  it('names each card, in rank order, phrased for its kind, and pins them ahead of Wendy', () => {
    const s = snap()
    s.cards = [
      { kind: 'event', id: 'e', title: 'Standup', urgency: 0.95 },
      { kind: 'task', id: 't', title: 'Write the report', urgency: 0.6 },
      { kind: 'notification', id: 'n', title: 'Stretch', urgency: 0.7 },
    ]
    const opts = localOptions('home', s).filter((o) => !MOMENT.has(o.label))
    // Each card's best idea in rank order, then the day, then each card's alternates.
    expect(opts.map((o) => o.label).slice(0, 4)).toEqual([
      'Prep: Standup',
      'Start: Write the report',
      'Got it: Stretch',
      'Plan my day',
    ])
    // Wendy's (written for this moment) lead; the top card and direct actions keep their places right after.
    const merged = mergeOptions(opts, [sayOption('Generic idea', 'x', 'agent')], []).map((o) => o.label)
    expect(merged.slice(0, 3)).toEqual(['Generic idea', 'Prep: Standup', 'Got it: Stretch'])
  })
})

describe('merge', () => {
  it("leads with Wendy's (pushed, then generated), keeps room for local acts, then local says; dedupes and caps", () => {
    const local = [sayOption('Plan my day'), actOption('Done', { type: 'complete', id: 'a' })]
    const fromAgent = [sayOption('plan my day!', 'Plan my day', 'agent'), sayOption('Quick wins', 'x', 'agent')]
    const pushed = [sayOption('From Wendy', 'y', 'pushed')]
    const out = mergeOptions(local, fromAgent, pushed, 3).map((o) => o.label)
    expect(out).toEqual(['From Wendy', 'plan my day!', 'Done'])
    const offer = actOption('Let Wendy remind me', { type: 'enablePush' })
    const withOffer = mergeOptions([offer, ...local], fromAgent, [], 3).map((o) => o.label)
    expect(withOffer).toEqual(['plan my day!', 'Done', 'Let Wendy remind me'])
  })

  it("when she offered her own answers, generated ideas don't crowd in (card actions still show)", () => {
    const local = [actOption('Done', { type: 'complete', id: 'a' }), sayOption('Plan my day')]
    const fromAgent = [sayOption('F1 highlights', 'x', 'agent'), sayOption('SpaceX update', 'y', 'agent')]
    const pushed = [sayOption('Yes please', 'Yes please', 'pushed'), sayOption('Not right now', 'Not now', 'pushed')]
    const out = mergeOptions(local, fromAgent, pushed, 6).map((o) => o.label)
    expect(out).toEqual(['Yes please', 'Not right now', 'Done'])
  })

  it('a check-in keeps its "Not now" however many answers she gave', () => {
    const local = [actOption('Done', { type: 'complete', id: 'a' }), actOption('Start', { type: 'startTask', id: 'a' })]
    const pushed = [
      sayOption('Going well', 'a', 'pushed'),
      sayOption('Help me', 'b', 'pushed'),
      sayOption('Not yet', 'c', 'pushed'),
      actOption('Not now', { type: 'checkinLater' }),
    ]
    const out = mergeOptions(local, [], pushed, 4).map((o) => o.label)
    expect(out.at(-1)).toBe('Not now')
    expect(out).toHaveLength(4)
  })

  it('puts what answers her question first, even with five ideas and two actions in play', () => {
    const local = [
      actOption('Done', { type: 'complete', id: 'a' }),
      actOption('Tomorrow', { type: 'reschedule', id: 'a', due: 'x' }),
      sayOption('Plan my day'),
    ]
    const fromAgent = ['Yes, move it', 'Keep it today', 'Break it down', 'Why this?', 'Something else'].map((l) =>
      sayOption(l, l, 'agent'),
    )
    expect(mergeOptions(local, fromAgent, []).map((o) => o.label)).toEqual([
      'Yes, move it',
      'Keep it today',
      'Break it down',
      'Done',
      'Tomorrow',
      'Why this?',
    ])
  })
})

describe('parseAgentOptions', () => {
  it('accepts the object form, a bare array and fenced JSON', () => {
    expect(parseAgentOptions('{"options":[{"label":"Yes","say":"Yes please"}]}')).toHaveLength(1)
    expect(parseAgentOptions('[{"label":"No"}]')[0].say).toBe('No')
    expect(parseAgentOptions('```json\n{"options":[{"label":"Ok","say":"Ok"}]}\n```')).toHaveLength(1)
  })

  it('rejects junk and duplicates, shortens over-long labels (keeping the full say); caps at five', () => {
    expect(parseAgentOptions('not json')).toEqual([])
    expect(parseAgentOptions('{"options":"nope"}')).toEqual([])
    const long = 'Help me draft the two questions for Steve and Kham'
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}` }))
    const parsed = parseAgentOptions(JSON.stringify({ options: [{ label: long }, { label: 'A' }, { label: 'a' }] }))
    expect(parsed).toHaveLength(2)
    expect(parsed[0].label.length).toBeLessThanOrEqual(24)
    expect(parsed[0].say).toBe(long)
    expect(parseAgentOptions(JSON.stringify({ options: many }))).toHaveLength(5)
  })
})

describe('Wendy-driven UI actions', () => {
  beforeEach(() => {
    useUi.setState({ focus: null, chatOpen: false, selected: null, theme: 'auto', keyboardOpen: false })
    useOptionsStore.setState({ pushed: null })
    useEntities.setState({
      tasks: { t1: task('t1') },
      events: { e1: { id: 'e1', title: 'E' } as never },
    })
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

  it('options.set during a glance belongs to the chat it comes back to', () => {
    useUi.setState({ chatOpen: true })
    runUiAction('card.open', { kind: 'task', id: 't1' }) // a glance: the chat returns shortly
    runUiAction('options.set', { options: [{ label: 'Yes' }, { label: 'No' }] })
    expect(useOptionsStore.getState().pushed?.key).toBe('chat')
    stopPeek()
  })

  it('pushed options follow the conversation between home and chat, not into panels', () => {
    expect(pushedShowsIn('chat', 'home')).toBe(true)
    expect(pushedShowsIn('home', 'chat')).toBe(true)
    expect(pushedShowsIn('item:task:t1', 'item:task:t1')).toBe(true)
    expect(pushedShowsIn('chat', 'tile:tasks')).toBe(false)
    expect(pushedShowsIn('item:task:t1', 'home')).toBe(false)
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
    const fromAgent = [sayOption('Old idea', 'x', 'agent'), sayOption('Fresh idea', 'y', 'agent')]
    const stale = (o: { label: string }) => o.label === 'Old idea' || o.label === 'Done'
    expect(mergeOptions(local, fromAgent, [], 6, stale).map((o) => o.label)).toEqual([
      'Fresh idea',
      'Done',
      'Plan my day',
    ])
    const allStale = () => true
    expect(mergeOptions([], fromAgent, [], 6, allStale).length).toBe(2)
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

  it('leads with answers to her question, even when they come in last', () => {
    const local = [sayOption('Ease me in'), sayOption('One big win')]
    const fromAgent = [
      sayOption('Tell me more', 'Tell me more', 'agent'),
      { ...sayOption('Yes please', 'Yes please', 'agent'), answer: true },
      { ...sayOption('Not right now', 'Not right now', 'agent'), answer: true },
    ]
    const out = mergeOptions(local, fromAgent, []).map((o) => o.label)
    expect(out.slice(0, 2)).toEqual(['Yes please', 'Not right now'])
    // Generic suggestions sit out while she's waiting on an answer.
    expect(out).not.toContain('Ease me in')
  })
})
