import { describe, expect, it } from 'vitest'
import type { CalendarOccurrence } from '../aelora/protocol'
import { clashes } from '../ui/tiles/data'
import { sessions, useSession } from './session'

describe('focus sessions', () => {
  it('the running one is active; ending it clears it', () => {
    sessions.setList([
      { id: 'old', started_at: '2026-10-08T08:00:00Z', ended_at: '2026-10-08T09:00:00Z', anchor_response: null },
      { id: 'now', started_at: '2026-10-08T10:00:00Z', ended_at: null, anchor_response: 'Write the report' },
    ])
    expect(useSession.getState().active?.id).toBe('now')
    sessions.apply({ id: 'now', started_at: '2026-10-08T10:00:00Z', ended_at: '2026-10-08T10:25:00Z' })
    expect(useSession.getState().active).toBeNull()
    sessions.apply({ nope: true })
    expect(useSession.getState().active).toBeNull()
  })
})

describe('calendar clashes', () => {
  const ev = (id: string, start: string, end: string, extra: Partial<CalendarOccurrence> = {}) =>
    ({ id, title: id.toUpperCase(), start_time: start, end_time: end, all_day: false, ...extra }) as CalendarOccurrence

  it('flags overlapping timed events, both ways, and ignores all-day ones', () => {
    const map = clashes([
      ev('a', '2026-10-08T10:00:00Z', '2026-10-08T11:00:00Z'),
      ev('b', '2026-10-08T10:30:00Z', '2026-10-08T11:30:00Z'),
      ev('c', '2026-10-08T12:00:00Z', '2026-10-08T13:00:00Z'),
      ev('d', '2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', { all_day: true }),
    ])
    expect(map.get('a@')).toBe('B')
    expect(map.get('b@')).toBe('A')
    expect(map.has('c@')).toBe(false)
    expect(map.has('d@')).toBe(false)
  })
})
