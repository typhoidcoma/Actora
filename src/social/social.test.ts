import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerFrame } from '../aelora/protocol'
import type { FrameBus } from '../aelora/socket'
import { contiguousTop, messagesFor, social, totalUnread, useSocial, withMessage } from '../stores/social'
import { useUi } from '../stores/ui'
import {
  handleSocialFrame,
  markRead,
  openDmWith,
  resetSocialLink,
  retryDm,
  sendDm,
  setPendingInvite,
  socialConnected,
} from './social'
import type { DmMessage, Thread } from './types'

function fakeBus() {
  const sent: Array<{ type: string } & Record<string, unknown>> = []
  const bus = { send: (m: { type: string }) => (sent.push(m as never), true), subscribe: () => () => {} } as unknown as FrameBus
  return { bus, sent, frame: (f: ServerFrame) => handleSocialFrame(f, bus) }
}

const ME = 'me'
const msg = (seq: number, over: Partial<DmMessage> = {}): DmMessage => ({
  id: `m${seq}`,
  threadId: 't1',
  seq,
  senderId: 'sam',
  senderKind: 'human',
  clientMsgId: `c${seq}`,
  body: `hello ${seq}`,
  createdAt: `2026-10-13T10:00:${String(seq).padStart(2, '0')}Z`,
  editedAt: null,
  deletedAt: null,
  ...over,
})
const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 't1',
  kind: 'dm',
  title: null,
  lastSeq: 0,
  lastMessageAt: null,
  lastReadSeq: 0,
  muted: false,
  unread: 0,
  members: [{ userId: 'sam', role: 'member', handle: 'sam', displayName: 'Sam', avatarPath: null }],
  lastMessage: null,
  ...over,
})

beforeEach(() => {
  social.reset()
  resetSocialLink()
  setPendingInvite(null)
  useUi.setState({ people: false, dmThread: null })
})
afterEach(() => vi.useRealTimers())

describe('social connect sequence', () => {
  it('asks for the profile, friends and threads, then syncs held threads from their contiguous top', () => {
    const { bus, sent } = fakeBus()
    useSocial.setState({ messages: { t1: { 1: msg(1), 2: msg(2), 5: msg(5) } } })
    socialConnected(bus)
    expect(sent.map((m) => m.type)).toEqual(['profile.get', 'friends.list', 'dm.threads', 'dm.sync'])
    expect(sent[3]).toMatchObject({ since: { t1: 2 } })
  })

  it('resends what was still sending, with the same clientMsgId', () => {
    const { bus, sent } = fakeBus()
    socialConnected(bus)
    sendDm('t1', 'hi')
    const id = sent.at(-1)!.clientMsgId
    sent.length = 0
    socialConnected(bus)
    expect(sent.filter((m) => m.type === 'dm.send')).toEqual([
      { type: 'dm.send', threadId: 't1', body: 'hi', clientMsgId: id },
    ])
  })

  it('redeems an invite only once there is a handle', () => {
    const { bus, sent, frame } = fakeBus()
    setPendingInvite('abc')
    socialConnected(bus)
    frame({ type: 'profile', profile: null })
    expect(sent.some((m) => m.type === 'friends.invite.redeem')).toBe(false)
    expect(useUi.getState().people).toBe(true) // to pick a handle
    frame({ type: 'profile', profile: { userId: ME, handle: 'me', displayName: null, avatarPath: null } })
    expect(sent.filter((m) => m.type === 'friends.invite.redeem')).toEqual([{ type: 'friends.invite.redeem', token: 'abc' }])
    frame({ type: 'profile', profile: { userId: ME, handle: 'me', displayName: null, avatarPath: null } })
    expect(sent.filter((m) => m.type === 'friends.invite.redeem')).toHaveLength(1)
  })

  it('claiming a handle loads the friends and threads refused without one', () => {
    const { bus, sent, frame } = fakeBus()
    socialConnected(bus)
    frame({ type: 'profile', profile: null })
    sent.length = 0
    frame({ type: 'profile', profile: { userId: ME, handle: 'me', displayName: null, avatarPath: null } })
    expect(sent.map((m) => m.type)).toEqual(['friends.list', 'dm.threads'])
  })

  it('a guest is told so, and nothing else breaks', () => {
    const { frame } = fakeBus()
    expect(frame({ type: 'error', code: 'guest_not_allowed', request: 'profile.get' })).toBe(true)
    expect(useSocial.getState()).toMatchObject({ guest: true, profile: null })
  })

  it("leaves other errors to their owners", () => {
    const { frame } = fakeBus()
    expect(frame({ type: 'error', code: 'llm_failed' })).toBe(false)
    expect(frame({ type: 'error', code: 'data_failed', request: 'task.list' })).toBe(false)
  })
})

describe('the four rules', () => {
  it('dedupes: dm.sent, dm.message and dm.synced of one message make one row', () => {
    const { bus, frame } = fakeBus()
    socialConnected(bus)
    useSocial.setState({ threads: { t1: thread() }, profile: { userId: ME, handle: 'me', displayName: null, avatarPath: null } })
    const m = msg(1, { senderId: ME, clientMsgId: 'x' })
    frame({ type: 'dm.sent', clientMsgId: 'x', message: m })
    frame({ type: 'dm.message', message: m })
    frame({ type: 'dm.synced', threads: [{ threadId: 't1', messages: [m], more: false }] })
    expect(messagesFor(useSocial.getState().messages, 't1')).toHaveLength(1)
    expect(useSocial.getState().threads.t1!.unread).toBe(0) // your own never count
  })

  it('orders by seq, not arrival', () => {
    const { frame } = fakeBus()
    useSocial.setState({ threads: { t1: thread() } })
    for (const s of [3, 1, 2]) frame({ type: 'dm.message', message: msg(s) })
    expect(messagesFor(useSocial.getState().messages, 't1').map((m) => m.seq)).toEqual([1, 2, 3])
    expect(useSocial.getState().threads.t1).toMatchObject({ lastSeq: 3, unread: 3 })
  })

  it('syncs from the highest contiguous seq, and pages when there is more', () => {
    const held = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 10].map((s) => [s, msg(s)]))
    expect(contiguousTop(held)).toBe(7)
    const { bus, sent, frame } = fakeBus()
    socialConnected(bus)
    sent.length = 0
    frame({ type: 'dm.synced', threads: [{ threadId: 't1', messages: [msg(1), msg(2)], more: true }] })
    expect(sent).toEqual([{ type: 'dm.sync', since: { t1: 2 } }])
  })

  it('marks read up to the contiguous top, once per position', () => {
    const { bus, sent } = fakeBus()
    socialConnected(bus)
    sent.length = 0
    useSocial.setState({ threads: { t1: thread({ lastSeq: 3 }) }, messages: { t1: { 1: msg(1), 2: msg(2), 4: msg(4) } } })
    markRead('t1')
    markRead('t1')
    expect(sent).toEqual([{ type: 'dm.read', threadId: 't1', seq: 2 }])
  })

  it('a deleted message keeps its place, and an older copy never undoes the delete', () => {
    let s: Parameters<typeof withMessage>[0] = { messages: {}, threads: { t1: thread() } }
    s = withMessage(s, msg(1), ME)
    s = withMessage(s, msg(1, { body: '', deletedAt: '2026-10-13T11:00:00Z' }), ME)
    s = withMessage(s, msg(1), ME) // a stale sync copy
    expect(messagesFor(s.messages, 't1')).toMatchObject([{ seq: 1, deletedAt: '2026-10-13T11:00:00Z' }])
  })
})

describe('sending', () => {
  it('shows at once, then lands', () => {
    const { bus, sent, frame } = fakeBus()
    socialConnected(bus)
    useSocial.setState({ threads: { t1: thread() } })
    sendDm('t1', '  hey  ')
    const send = sent.at(-1)!
    expect(send).toMatchObject({ type: 'dm.send', threadId: 't1', body: 'hey' })
    expect(Object.values(useSocial.getState().pending)).toMatchObject([{ state: 'sending', body: 'hey' }])
    frame({ type: 'dm.sent', clientMsgId: send.clientMsgId, message: msg(1, { senderId: ME, clientMsgId: String(send.clientMsgId) }) })
    expect(useSocial.getState().pending).toEqual({})
    expect(messagesFor(useSocial.getState().messages, 't1')).toHaveLength(1)
  })

  it('an error for that message fails it; retry reuses the id', () => {
    const { bus, sent, frame } = fakeBus()
    socialConnected(bus)
    sendDm('t1', 'hey')
    const id = String(sent.at(-1)!.clientMsgId)
    frame({ type: 'error', code: 'rate_limited', request: 'dm.send', clientMsgId: id })
    expect(useSocial.getState().pending[id]).toMatchObject({ state: 'failed', error: 'rate_limited' })
    retryDm(id)
    expect(useSocial.getState().pending[id]!.state).toBe('sending')
    expect(sent.at(-1)).toMatchObject({ type: 'dm.send', clientMsgId: id })
  })

  it('no answer in 15 s fails it', () => {
    vi.useFakeTimers()
    const { bus } = fakeBus()
    socialConnected(bus)
    sendDm('t1', 'hey')
    vi.advanceTimersByTime(15_001)
    expect(Object.values(useSocial.getState().pending)).toMatchObject([{ state: 'failed', error: 'timeout' }])
  })

  it('refuses empty and over-long messages', () => {
    const { bus } = fakeBus()
    socialConnected(bus)
    expect(sendDm('t1', '   ')).toBe(false)
    expect(sendDm('t1', 'x'.repeat(4001))).toBe(false)
  })
})

describe('threads and unread', () => {
  it('a read elsewhere clears the count; muted threads stay out of the badge', () => {
    const { frame } = fakeBus()
    useSocial.setState({ threads: { t1: thread({ lastSeq: 2, unread: 2 }), t2: thread({ id: 't2', unread: 4, muted: true }) } })
    expect(totalUnread(useSocial.getState().threads)).toBe(2)
    frame({ type: 'dm.state', threadId: 't1', lastReadSeq: 2, muted: false })
    expect(useSocial.getState().threads.t1!.unread).toBe(0)
  })

  it('opening a DM with a friend shows the thread when it comes back', () => {
    const { bus, sent, frame } = fakeBus()
    socialConnected(bus)
    useUi.setState({ people: true })
    openDmWith('sam')
    expect(sent.at(-1)).toEqual({ type: 'dm.open', userId: 'sam' })
    frame({ type: 'dm.thread', thread: thread() })
    expect(useUi.getState().dmThread).toBe('t1')
  })
})
