import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerFrame } from './protocol'
import { failInflight, request, resetLateReplies } from './request'
import type { FrameBus } from './socket'

/** A bus whose frames the test pushes by hand. */
function fakeBus() {
  const subs = new Set<(f: ServerFrame) => void>()
  const sent: Array<{ type: string }> = []
  const bus = {
    send: (m: { type: string }) => (sent.push(m), true),
    subscribe: (fn: (f: ServerFrame) => void) => (subs.add(fn), () => subs.delete(fn)),
  } as unknown as FrameBus
  return { bus, sent, emit: (f: ServerFrame) => [...subs].forEach((fn) => fn(f)) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('request correlation', () => {
  afterEach(() => {
    vi.useRealTimers()
    resetLateReplies()
  })

  it('a dropped socket fails what was in flight without swallowing the next reply', async () => {
    vi.useFakeTimers()
    const { bus, emit } = fakeBus()
    const lost = request(bus, { type: 'focus.start' }, 'focus.started', 12_000)
    await vi.advanceTimersByTimeAsync(0) // sent (it queues behind any of its kind first)
    failInflight() // the socket dropped: its reply will never come
    expect(await lost).toBeNull()
    await vi.advanceTimersByTimeAsync(13_000) // the old timeout firing must not mark a reply late
    const next = request(bus, { type: 'focus.start' }, 'focus.started', 12_000)
    await vi.advanceTimersByTimeAsync(0)
    emit({ type: 'focus.started', id: 's2' })
    expect(await next).toMatchObject({ id: 's2' })
  })

  it("a reply that arrives after its request timed out doesn't resolve the next one", async () => {
    vi.useFakeTimers()
    const { bus, emit } = fakeBus()
    const first = request(bus, { type: 'goal.list' }, 'goal.list', 1000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await first).toBeNull()
    const second = request(bus, { type: 'goal.list' }, 'goal.list', 5000)
    await vi.advanceTimersByTimeAsync(1)
    emit({ type: 'goal.list', goals: ['late'] }) // the first one's, late
    emit({ type: 'goal.list', goals: ['fresh'] })
    expect(await second).toMatchObject({ goals: ['fresh'] })
  })

  it('a request that knows its item only takes a reply about that item', async () => {
    const { bus, emit } = fakeBus()
    const p = request(bus, { type: 'task.update', id: 'b' }, 'task.updated', {
      match: (f) => (f as { task?: { id: string } }).task?.id === 'b',
    })
    await tick()
    emit({ type: 'task.updated', task: { id: 'a' } })
    emit({ type: 'task.updated', task: { id: 'b' } })
    expect(await p).toMatchObject({ task: { id: 'b' } })
  })

  it('an unattributed error only fails a request sent moments ago', async () => {
    vi.useFakeTimers()
    const { bus, emit } = fakeBus()
    const fresh = request(bus, { type: 'session.list' }, 'session.list', 20_000)
    await vi.advanceTimersByTimeAsync(1)
    emit({ type: 'error', code: 'data_failed' })
    expect(await fresh).toBeNull()
    const old = request(bus, { type: 'vault.list' }, 'vault.list', 20_000)
    await vi.advanceTimersByTimeAsync(5000)
    emit({ type: 'error', code: 'data_failed' }) // too late to be about this one
    emit({ type: 'vault.list', entries: [] })
    expect(await old).toMatchObject({ type: 'vault.list' })
  })

  it("an error naming another request (a failed dm.send) doesn't fail this one", async () => {
    const { bus, emit } = fakeBus()
    const p = request(bus, { type: 'task.list' }, 'task.list', 20_000)
    await tick()
    emit({ type: 'error', code: 'rate_limited', request: 'dm.send', clientMsgId: 'c1' })
    emit({ type: 'task.list', tasks: [] })
    expect(await p).toMatchObject({ type: 'task.list' })
  })
})
