import { describe, expect, it } from 'vitest'
import { ANGLES, arrivalFrom, awayWords, greetingDirective, type Facts } from './greeting'

const f: Facts = {
  part: 'morning',
  weekday: 'Friday',
  name: 'Tyler',
  weather: '54°F, grey',
  openTasks: 0,
  topTask: null,
  nextEvent: { title: 'Engineering sync', mins: 150 },
  unread: 0,
  arrival: { kind: 'first' },
  lastChat: null,
}

const HOUR = 3600_000

describe('greeting', () => {
  it('asks Wendy for a fresh opener with an angle and real context, never a canned line', () => {
    const d = greetingDirective(f, ANGLES[1], [])
    expect(d).toContain('APP EVENT')
    expect(d).toContain(`Angle for this greeting: ${ANGLES[1]}`)
    expect(d).toContain('Friday morning')
    expect(d).toContain('Their name is Tyler')
    expect(d).toContain('"Engineering sync" in 150 minutes')
    expect(d).toContain('You have no chat with them yet.')
  })

  it('steers away from her recent greetings', () => {
    const d = greetingDirective(f, ANGLES[0], ["hey tyler. zero tasks on the board, what's the play?"])
    expect(d).toMatch(/don't reuse their openings, structure or jokes: "hey tyler/)
  })

  it('picks up where the last chat left off instead of an angle', () => {
    const d = greetingDirective(
      {
        ...f,
        arrival: { kind: 'back', away: 5 * HOUR },
        lastChat: { user: 'Help me prep for the interview', agent: 'Start with your three stories.', ago: 5 * HOUR },
      },
      ANGLES[2],
      [],
    )
    expect(d).toContain('back in the Actora app after 5 hours away')
    expect(d).toContain('Where your main chat left off (5 hours ago): they said "Help me prep for the interview"')
    expect(d).toContain('you said "Start with your three stories."')
    expect(d).toContain('Pick up where your chat left off')
    expect(d).not.toContain('Angle for this greeting')
  })

  it('an old chat is context, not something to pick up', () => {
    const d = greetingDirective({ ...f, lastChat: { user: 'hi', agent: 'hey', ago: 10 * 24 * HOUR } }, ANGLES[3], [])
    expect(d).toContain(`Angle for this greeting: ${ANGLES[3]}`)
    expect(d).toContain('(10 days ago)')
  })

  it('a reload carries on, with no hello', () => {
    const d = greetingDirective(
      { ...f, arrival: { kind: 'reload' }, lastChat: { user: 'yes', agent: 'Blocking 2–4 for it.', ago: 60_000 } },
      ANGLES[0],
      [],
    )
    expect(d).toContain('just reloaded')
    expect(d).toContain('no hello')
    expect(d).not.toContain('Angle for this greeting')
  })

  it('tells a reload from a return, and a first visit from both', () => {
    const now = 1_000_000_000
    expect(arrivalFrom(null, now)).toEqual({ kind: 'first' })
    expect(arrivalFrom(now - 30_000, now)).toEqual({ kind: 'reload' })
    expect(arrivalFrom(now - 2 * HOUR, now)).toEqual({ kind: 'back', away: 2 * HOUR })
  })

  it('says how long in plain words', () => {
    expect(awayWords(60_000)).toBe('1 minute')
    expect(awayWords(20_000)).toBe('1 minute')
    expect(awayWords(25 * 60_000)).toBe('25 minutes')
    expect(awayWords(3 * HOUR)).toBe('3 hours')
    expect(awayWords(26 * HOUR)).toBe('a day')
    expect(awayWords(5 * 24 * HOUR)).toBe('5 days')
  })
})
