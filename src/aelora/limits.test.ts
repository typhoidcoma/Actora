import { beforeEach, describe, expect, it } from 'vitest'

// Aelora's per-user limits on chat: a refused message ends her turn at once.
const mem = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
})

const { useAgent } = await import('../stores/agent')
const { routeFrame } = await import('./router')
const { sendChat, sendGreeting } = await import('./chat')
const { MAX_CHAT_CHARS } = await import('./protocol')

const bus = { send: () => true, subscribe: () => () => {} }
const A = '11111111-1111-1111-1111-111111111111'

describe('chat limits', () => {
  beforeEach(() => {
    useAgent.setState({
      conversationId: A,
      messages: [],
      turnId: null,
      awaitingTurn: false,
      greetingPending: false,
      connection: 'open',
      phase: 'idle',
    })
  })

  it('a rate_limited reply to her message fails the turn straight away', () => {
    expect(sendChat(bus, 'Plan my day')).toBe(true)
    routeFrame({ type: 'error', code: 'rate_limited', request: 'chat' }, bus)
    const s = useAgent.getState()
    expect(s.awaitingTurn).toBe(false)
    expect(s.phase).toBe('idle')
    expect(s.messages.at(-1)).toMatchObject({ role: 'error' })
    expect(s.messages.at(-1)?.text).toContain('too many messages')
  })

  it("People's rate limit leaves her turn alone", () => {
    expect(sendChat(bus, 'Plan my day')).toBe(true)
    routeFrame({ type: 'error', code: 'rate_limited', request: 'dm.send', clientMsgId: 'c1' }, bus)
    expect(useAgent.getState().awaitingTurn).toBe(true)
  })

  it('a refused welcome stops waiting for it', () => {
    expect(sendGreeting(bus, 'Say hello')).toBe(true)
    expect(useAgent.getState().greetingPending).toBe(true)
    routeFrame({ type: 'error', code: 'rate_limited', request: 'system_chat' }, bus)
    expect(useAgent.getState().greetingPending).toBe(false)
    expect(useAgent.getState().phase).toBe('idle')
  })

  it('a deleted thread: forgets it and sends the message once more on a fresh one', () => {
    const sent: Array<Record<string, unknown>> = []
    const spy = { send: (m: Record<string, unknown>) => (sent.push(m), true), subscribe: () => () => {} }
    expect(sendChat(spy as never, 'Plan my day')).toBe(true)
    routeFrame({ type: 'error', code: 'not_found', request: 'chat', conversationId: A }, bus)
    expect(sent.at(-1)).toEqual({ type: 'conversation.new' })
    expect(useAgent.getState().awaitingTurn).toBe(true)
    routeFrame({ type: 'conversation.created', conversationId: 'B', title: null }, bus)
    expect(sent.at(-1)).toEqual({ type: 'chat', message: 'Plan my day', conversationId: 'B' })
    // The fresh thread failing too: give up now, not after the backstop.
    routeFrame({ type: 'error', code: 'not_found', request: 'chat', conversationId: 'B' }, bus)
    expect(useAgent.getState().awaitingTurn).toBe(false)
    expect(useAgent.getState().conversationId).toBe(null)
  })

  it("a failed welcome leaves the user's turn alone", () => {
    expect(sendGreeting(bus, 'Say hello')).toBe(true)
    expect(sendChat(bus, 'Plan my day')).toBe(true)
    routeFrame({ type: 'error', code: 'llm_failed', channelId: 'system:u1', message: 'llm error' }, bus)
    const s = useAgent.getState()
    expect(s.awaitingTurn).toBe(true)
    expect(s.greetingPending).toBe(false)
  })

  it('another conversation call failing leaves the turn alone', () => {
    expect(sendChat(bus, 'Plan my day')).toBe(true)
    routeFrame({ type: 'error', code: 'conversation_failed', request: 'conversation.rename' }, bus)
    expect(useAgent.getState().awaitingTurn).toBe(true)
  })

  it("won't send a message longer than Aelora takes", () => {
    expect(sendChat(bus, 'x'.repeat(MAX_CHAT_CHARS + 1))).toBe(false)
    expect(useAgent.getState().awaitingTurn).toBe(false)
  })
})
