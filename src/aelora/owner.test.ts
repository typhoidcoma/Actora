import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgent } from '../stores/agent'
import { useUi } from '../stores/ui'
import { eventVerdict, ownerOf } from './owner'
import { routeFrame } from './router'
import type { FrameBus } from './socket'

const bus = () => {
  const sent: Array<{ type: string }> = []
  return {
    sent,
    bus: { send: (m: { type: string }) => (sent.push(m), true), subscribe: () => () => {} } as unknown as FrameBus,
  }
}
const command = (userId?: string) => ({
  type: 'event',
  event: 'agent_command',
  data: { command: { type: 'ui_action', action: 'vault.open', args: {} }, ...(userId ? { userId } : {}) },
})

describe('ownerOf / eventVerdict', () => {
  it('reads the owner from the envelope, the data, or the entity', () => {
    expect(ownerOf({ userId: 'a' }, {})).toBe('a')
    expect(ownerOf({}, { userId: 'b' })).toBe('b')
    expect(ownerOf({}, { task: { user_id: 'c' } })).toBe('c')
    expect(ownerOf({}, { type: 'vault:created' })).toBeNull()
  })

  it("applies ours, drops others', and distrusts unlabelled events only on admin sockets", () => {
    expect(eventVerdict('agent_command', {}, { userId: 'me' }, 'me', true)).toBe('apply')
    expect(eventVerdict('agent_command', {}, { userId: 'friend' }, 'me', false)).toBe('drop')
    expect(eventVerdict('agent_command', {}, {}, 'me', false)).toBe('apply')
    expect(eventVerdict('agent_command', {}, {}, 'me', true)).toBe('drop')
    expect(eventVerdict('mood', {}, {}, 'me', true)).toBe('drop')
    expect(eventVerdict('task', {}, { type: 'task:created' }, 'me', true)).toBe('refetch')
    expect(eventVerdict('conversation', {}, { type: 'conversation:purged' }, 'me', true)).toBe('drop')
    expect(eventVerdict('conversation', {}, { type: 'conversation:appended' }, 'me', true)).toBe('apply')
  })
})

describe('routeFrame respects the signed-in user', () => {
  beforeEach(() => {
    useUi.setState({ focus: null, chatOpen: false, selected: null, reader: false, finds: false, vault: false })
    useAgent.setState({ userId: 'me', isAdmin: true, turnId: null, mood: null as never })
  })
  afterEach(() => vi.useRealTimers())

  it("never lets another user's Wendy drive this screen", () => {
    const { bus: b } = bus()
    routeFrame(command('friend'), b)
    routeFrame(command(), b) // unlabelled, on an admin socket
    routeFrame({ type: 'event', event: 'mood', data: { userId: 'friend', mood: 'x' } }, b)
    expect(useUi.getState().vault).toBe(false)
    expect(useAgent.getState().mood).toBeNull()
    routeFrame(command('me'), b)
    expect(useUi.getState().vault).toBe(true)
  })

  it('a non-admin socket is already scoped by the server', () => {
    useAgent.setState({ isAdmin: false })
    routeFrame(command(), bus().bus)
    expect(useUi.getState().vault).toBe(true)
  })

  it('an unprovable data change on an admin socket refetches our own list instead', async () => {
    vi.useFakeTimers()
    const { sent, bus: b } = bus()
    routeFrame({ type: 'event', event: 'task', data: { type: 'task:created', task: { id: 'x', title: 'Theirs' } } }, b)
    await vi.advanceTimersByTimeAsync(500)
    expect(sent.map((m) => m.type)).toContain('task.list')
  })

  it('runs a ui_action called as a tool only for our own turn', () => {
    const frame = (cid: string) => ({
      type: 'tool.progress',
      phase: 'called',
      conversationId: cid,
      name: 'vault_open',
      argsSummary: '{}',
    })
    routeFrame(frame('their-thread'), bus().bus)
    expect(useUi.getState().vault).toBe(false)
    useAgent.setState({ turnId: 'my-thread' })
    routeFrame(frame('my-thread'), bus().bus)
    expect(useUi.getState().vault).toBe(true)
  })
})
