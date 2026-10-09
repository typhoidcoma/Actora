import { beforeEach, describe, expect, it } from 'vitest'

// Minimal localStorage for the per-user cache tests (Node has none).
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
const { adoptFindsUser, useFinds } = await import('../finds/finds')

const bus = { send: () => true, subscribe: () => () => {} }
const A = '11111111-1111-1111-1111-111111111111'
const msg = (seq: number) => ({ seq, role: seq % 2 ? 'user' : 'assistant', content: `m${seq}`, createdAt: '' })

describe('conversation lifecycle', () => {
  beforeEach(() => {
    useAgent.setState({ conversationId: A, messages: [], history: { hasMore: false, cursor: null }, turnId: null })
  })

  it('replaces on a fresh page and prepends an older one (paging backwards)', () => {
    routeFrame(
      { type: 'conversation.messages', conversationId: A, messages: [msg(5), msg(6)], hasMore: true, nextBeforeSeq: 5 },
      bus,
    )
    expect(useAgent.getState().history).toEqual({ hasMore: true, cursor: 5 })
    routeFrame(
      {
        type: 'conversation.messages',
        conversationId: A,
        messages: [msg(3), msg(4)],
        hasMore: false,
        nextBeforeSeq: null,
      },
      bus,
    )
    expect(useAgent.getState().messages.map((m) => m.text)).toEqual(['m3', 'm4', 'm5', 'm6'])
    expect(useAgent.getState().history.hasMore).toBe(false)
  })

  it('ignores pages for other threads', () => {
    routeFrame({ type: 'conversation.messages', conversationId: 'other', messages: [msg(1)] }, bus)
    expect(useAgent.getState().messages).toEqual([])
  })

  it('forgets the active thread when it is deleted here or elsewhere, so the next chat starts fresh', () => {
    useAgent.setState({ messages: [{ id: 'x', role: 'user', text: 'hi' }] })
    routeFrame({ type: 'event', event: 'conversation', data: { type: 'conversation:deleted', conversationId: A } }, bus)
    expect(useAgent.getState()).toMatchObject({ conversationId: null, messages: [] })
  })

  it('a deletion of another thread leaves ours alone; a purge clears everything', () => {
    routeFrame({ type: 'conversation.deleted', conversationId: 'some-other' }, bus)
    expect(useAgent.getState().conversationId).toBe(A)
    routeFrame({ type: 'conversation.purged', count: 3 }, bus)
    expect(useAgent.getState().conversationId).toBeNull()
  })
})

describe('per-user caches', () => {
  it("never shows another account's fun finds", () => {
    mem.set(
      'actora.finds.v1',
      JSON.stringify({
        items: [{ id: 'u', title: 'Theirs', url: 'https://x', blurb: '', why: '', image: null, source: 'x', tag: 'x' }],
        day: '2026-01-01',
        seen: [],
        owner: 'alice',
      }),
    )
    adoptFindsUser('bob')
    expect(useFinds.getState().items).toEqual([])
    expect(mem.has('actora.finds.v1')).toBe(false)
  })

  it('restores the same account’s finds', () => {
    mem.set(
      'actora.finds.v1',
      JSON.stringify({
        items: [{ id: 'u', title: 'Mine', url: 'https://x', blurb: '', why: '', image: null, source: 'x', tag: 'x' }],
        day: '2026-01-01',
        seen: [],
        owner: 'carol',
      }),
    )
    adoptFindsUser('carol')
    expect(useFinds.getState().items.map((f) => f.title)).toEqual(['Mine'])
  })
})
