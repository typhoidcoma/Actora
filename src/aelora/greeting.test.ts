import { describe, expect, it } from 'vitest'
import { ANGLES, greetingDirective, type Facts } from './greeting'

const f: Facts = {
  part: 'morning',
  weekday: 'Friday',
  name: 'Tyler',
  weather: '54°F, grey',
  openTasks: 0,
  topTask: null,
  nextEvent: { title: 'Engineering sync', mins: 150 },
  unread: 0,
}

describe('greeting', () => {
  it('asks Wendy for a fresh opener with an angle and real context, never a canned line', () => {
    const d = greetingDirective(f, ANGLES[1], [])
    expect(d).toContain('APP EVENT')
    expect(d).toContain(`Angle for this greeting: ${ANGLES[1]}`)
    expect(d).toContain('Friday morning')
    expect(d).toContain('Their name is Tyler')
    expect(d).toContain('"Engineering sync" in 150 minutes')
  })

  it('steers away from her recent greetings', () => {
    const d = greetingDirective(f, ANGLES[0], ["hey tyler. zero tasks on the board, what's the play?"])
    expect(d).toMatch(/don't reuse their openings, structure or jokes: "hey tyler/)
  })
})
