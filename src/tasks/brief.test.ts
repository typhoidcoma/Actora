import { beforeEach, describe, expect, it } from 'vitest'
import type { Task } from '../aelora/protocol'
import { BRIEF_MARKER, briefRequest, cachedBrief, tidyBrief } from './brief'

// Node test env: a small in-memory localStorage.
const mem = new Map<string, string>()
globalThis.localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Prep bubble layout questions',
  status: 'todo',
  goal_id: null,
  vault_id: null,
  due_date: '2026-10-09',
  estimated_minutes: 15,
  committed_at: null,
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('task briefs', () => {
  beforeEach(() => localStorage.clear())

  it('asks about this task, with its goal, using what Wendy knows', () => {
    const r = briefRequest(task(), 'Ship Actora v1')
    expect(r.prompt).toContain(BRIEF_MARKER)
    expect(r.prompt).toContain('Title: "Prep bubble layout questions"')
    expect(r.prompt).toContain('Ship Actora v1')
    expect(r.context).toMatchObject({ profile: true, memoryQuery: 'Prep bubble layout questions' })
  })

  it('tidies the reply into plain sentences', () => {
    expect(tidyBrief('"**Start** with the\n\n# list."')).toBe('Start with the list.')
    expect(tidyBrief('"Wire it" unblocks the rest.')).toBe('"Wire it" unblocks the rest.')
  })

  it('uses a cached brief only while the task is unchanged', () => {
    localStorage.setItem(
      'actora.brief.v1',
      JSON.stringify({ t1: { sig: 't1|Prep bubble layout questions|2026-10-09|', text: 'Cached.', at: 1 } }),
    )
    expect(cachedBrief(task())).toBe('Cached.')
    expect(cachedBrief(task({ title: 'Renamed' }))).toBeNull()
  })
})
