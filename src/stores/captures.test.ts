import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerFrame } from '../aelora/protocol'
import type { FrameBus } from '../aelora/socket'
import { entities } from './entities'

// Node test env: a small in-memory localStorage (shared with the module under test).
const mem = new Map<string, string>()
globalThis.localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

/** A bus that answers every task.create by echoing the task back. */
function echoBus() {
  const subs = new Set<(f: ServerFrame) => void>()
  const created: string[] = []
  const bus = {
    send: (m: { type: string; title?: string }) => {
      if (m.type === 'task.create') {
        created.push(m.title!)
        queueMicrotask(() => subs.forEach((fn) => fn({ type: 'task.created', task: { id: m.title, title: m.title } })))
      }
      return true
    },
    subscribe: (fn: (f: ServerFrame) => void) => (subs.add(fn), () => subs.delete(fn)),
  } as unknown as FrameBus
  return { bus, created }
}

describe('offline quick capture', () => {
  beforeEach(() => {
    mem.clear()
    entities.reset()
  })

  it("is added only to its own owner's account, and never twice", async () => {
    const { capture, flushCaptures } = await import('./captures')
    await capture(null, false, 'alice', 'Buy strings')
    await capture(null, false, 'alice', 'Call mum')
    const { bus, created } = echoBus()
    // Someone else signs in on this device: Alice's thoughts stay put.
    await flushCaptures(bus, 'bob')
    expect(created).toEqual([])
    // One of them already made it (its reply was lost): don't add it again.
    entities.setTasks([{ id: 'x', title: 'Call mum' } as never])
    await flushCaptures(bus, 'alice')
    expect(created).toEqual(['Buy strings'])
  })
})
