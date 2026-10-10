import { describe, expect, it } from 'vitest'
import { checkinDirective, checkinDue, nextGap, type CheckinFacts, type CheckinState, type Moment } from './checkins'

const MIN = 60_000
const now = new Date(2026, 9, 10, 14, 0).getTime() // 2pm local
const state: CheckinState = {
  on: true,
  lastAt: 0,
  day: '',
  count: 0,
  backoff: 1,
  ignored: 0,
  nextAt: 0,
  open: null,
}
const moment: Moment = {
  now,
  hour: 14,
  lastActivity: now - 5 * MIN,
  lastChat: now - 60 * MIN,
  home: true,
  visible: true,
  busy: false,
}

describe('when Wendy checks in', () => {
  it('goes when they are around but idle, at home, with nothing else going on', () => {
    expect(checkinDue(state, moment)).toBe(true)
  })

  it('waits while they are busy, away, elsewhere in the app, or just talked', () => {
    expect(checkinDue(state, { ...moment, lastActivity: now - 30_000 })).toBe(false) // busy tapping
    expect(checkinDue(state, { ...moment, lastActivity: now - 45 * MIN })).toBe(false) // probably walked off
    expect(checkinDue(state, { ...moment, home: false })).toBe(false)
    expect(checkinDue(state, { ...moment, visible: false })).toBe(false)
    expect(checkinDue(state, { ...moment, busy: true })).toBe(false)
    expect(checkinDue(state, { ...moment, lastChat: now - 10 * MIN })).toBe(false)
  })

  it('respects quiet hours, the gap, the daily cap and the switch', () => {
    expect(checkinDue(state, { ...moment, hour: 22 })).toBe(false)
    expect(checkinDue(state, { ...moment, hour: 7 })).toBe(false)
    expect(checkinDue({ ...state, nextAt: now + MIN }, moment)).toBe(false)
    expect(checkinDue({ ...state, day: '2026-10-10', count: 4 }, moment)).toBe(false)
    expect(checkinDue({ ...state, day: '2026-10-09', count: 4 }, moment)).toBe(true) // a new day
    expect(checkinDue({ ...state, on: false }, moment)).toBe(false)
  })

  it('spaces them 60 to 120 minutes apart, stretched by backoff', () => {
    expect(nextGap(1, 0)).toBe(60 * MIN)
    expect(nextGap(1, 1)).toBe(120 * MIN)
    expect(nextGap(2, 0)).toBe(120 * MIN)
  })
})

describe('what she checks in about', () => {
  const f: CheckinFacts = {
    focus: null,
    lastChat: null,
    endedEvent: null,
    overdue: [],
    topTask: null,
    part: 'afternoon',
    recent: [],
  }

  it('hands her the most worthwhile things, first first', () => {
    const d = checkinDirective({
      ...f,
      focus: { minutes: 25, on: 'the deck' },
      endedEvent: { title: 'Design sync', ago: 20 * MIN },
      overdue: ['Send invoice'],
      topTask: 'Wire the orb shader',
    })
    expect(d).toContain('APP EVENT: a casual check-in')
    expect(d).toContain('Ask about ONE thing')
    expect(d.indexOf('focus session on "the deck"')).toBeLessThan(d.indexOf('"Design sync" ended 20 minutes ago'))
    expect(d).toContain('Overdue: "Send invoice"')
    expect(d).toContain('(say:')
  })

  it('with nothing going on, just asks how the day is going', () => {
    expect(checkinDirective(f)).toContain('just ask how their day is going')
  })

  it('steers away from her recent check-ins', () => {
    expect(checkinDirective({ ...f, recent: ['how is the deck coming along?'] })).toContain(
      `don't repeat their wording: "how is the deck coming along?"`,
    )
  })
})
