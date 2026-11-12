import { beforeEach, describe, expect, it, vi } from 'vitest'

// Her gifts (Aelora's give_gift): on the profile, under her reply, and opened by her gifts.open.
const mem = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
})

const { toGift } = await import('./gift')
const { gifts, useGifts } = await import('../stores/gifts')
const { useAgent } = await import('../stores/agent')
const { useUi, ui } = await import('../stores/ui')
const { routeFrame } = await import('../aelora/router')
const { eventVerdict } = await import('../aelora/owner')
const { AVAILABLE_ACTIONS } = await import('../aelora/actions')
const { useToast, toast } = await import('../stores/toast')

const bus = { send: () => true, subscribe: () => () => {} }
const record = (over: Record<string, unknown> = {}) => ({
  imageId: 'g1',
  prompt: 'a lighthouse',
  aspectRatio: '1:1',
  imageSize: '1K',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  createdAt: '2026-11-12T10:00:00Z',
  url: 'https://x.supabase.co/storage/v1/object/sign/images/u/g1.png?token=t',
  gift: { note: '  For the late nights.  ', persona: 'wendy' },
  ...over,
})
const arrive = (image: unknown) =>
  routeFrame({ type: 'event', event: 'gift', data: { type: 'gift:created', image } }, bus)
const command = (args: Record<string, unknown>) =>
  routeFrame(
    { type: 'event', event: 'agent_command', data: { command: { type: 'ui_action', action: 'gifts.open', args } } },
    bus,
  )

describe('a gift from the server', () => {
  it('keeps a whole gift, trimmed', () => {
    expect(toGift(record())).toMatchObject({ imageId: 'g1', note: 'For the late nights.', width: 1024 })
  })
  it('refuses images that are not gifts, and records that are not whole', () => {
    expect(toGift(record({ gift: null }))).toBeNull()
    expect(toGift(record({ imageId: 42 }))).toBeNull()
    expect(toGift(record({ url: 'javascript:alert(1)' }))).toBeNull()
    expect(toGift(null)).toBeNull()
  })
  it('cuts a long note to 280', () => {
    expect(toGift(record({ gift: { note: 'x'.repeat(900), persona: 'w' } }))!.note).toHaveLength(280)
  })
})

describe('when she gives one', () => {
  beforeEach(() => {
    gifts.reset()
    toast.dismiss()
    ui.closeAll()
    useAgent.setState({ messages: [], turnId: null, awaitingTurn: false, pendingGift: null, userId: null, isAdmin: false })
  })

  it('goes on the shelf once, new until opened', () => {
    arrive(record())
    arrive(record())
    expect(useGifts.getState().order).toEqual(['g1'])
    expect(useGifts.getState().unseen).toEqual(['g1'])
    gifts.show('g1')
    expect(useGifts.getState().unseen).toEqual([])
  })

  it('waits for the reply she is writing, then sits under it', () => {
    useAgent.setState({ turnId: 'c1' })
    arrive(record())
    expect(useAgent.getState().pendingGift).toBe('g1')
  })

  it('goes under her last words when no turn is under way', () => {
    useAgent.setState({ messages: [{ id: 'b1', role: 'assistant', text: 'Here.', at: new Date().toISOString() }] })
    arrive(record())
    expect(useAgent.getState().messages[0].gift).toBe('g1')
  })

  it("doesn't go on an old reply", () => {
    useAgent.setState({ messages: [{ id: 'b1', role: 'assistant', text: 'Old.', at: '2026-01-01T00:00:00Z' }] })
    arrive(record())
    expect(useAgent.getState().messages[0].gift).toBeUndefined()
  })

  it('says so, with a way to open it, when the chat is closed', () => {
    arrive(record())
    const t = useToast.getState().toasts.at(-1)!
    expect(t.text).toMatch(/gift/)
    t.action!.run()
    expect(useGifts.getState().open).toBe('g1')
  })

  it('mid-turn, waits for her to finish: no note if the chat opened for her answer', () => {
    useAgent.setState({ turnId: 'c1' })
    arrive(record())
    expect(useToast.getState().toasts).toHaveLength(0)
    useUi.setState({ chatOpen: true })
    useAgent.setState({ turnId: null })
    expect(useToast.getState().toasts).toHaveLength(0)
  })

  it("on an admin socket, someone else's gift never shows; an unlabelled one is refetched", () => {
    expect(eventVerdict('gift', { userId: 'other' }, {}, 'me', true)).toBe('drop')
    expect(eventVerdict('gift', {}, {}, 'me', true)).toBe('refetch')
  })
})

describe('gifts.open', () => {
  beforeEach(() => {
    gifts.reset()
    ui.closeAll()
    useAgent.setState({ userId: null, isAdmin: false })
  })

  it('is advertised', () => {
    expect(AVAILABLE_ACTIONS).toContain('gifts.open')
  })

  it('opens the profile, and a gift she names', () => {
    gifts.add(toGift(record())!, false)
    command({ imageId: 'g1' })
    expect(useUi.getState()).toMatchObject({ people: true, peopleView: 'profile' })
    expect(useGifts.getState().open).toBe('g1')
  })

  it('opens just the shelf for a gift that does not exist', () => {
    command({ imageId: 'nope' })
    command({ imageId: { evil: true } })
    expect(useUi.getState().peopleView).toBe('profile')
    expect(useGifts.getState().open).toBeNull()
  })
})

describe('removing one', () => {
  it('Undo puts it back and the server is never told', async () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    vi.doMock('../aelora/client', () => ({ ask: (m: unknown) => (sent.push(m), Promise.resolve(null)) }))
    vi.resetModules()
    const store = await import('../stores/gifts')
    const io = await import('./gifts')
    const t = await import('../stores/toast')
    store.gifts.add(toGift(record())!, false)
    io.removeGift('g1')
    expect(store.useGifts.getState().order).toEqual([])
    t.useToast.getState().toasts.at(-1)!.undo!()
    await vi.advanceTimersByTimeAsync(6000)
    expect(store.useGifts.getState().order).toEqual(['g1'])
    expect(sent.filter((m) => (m as { type: string }).type === 'image.delete')).toEqual([])
    vi.doUnmock('../aelora/client')
    vi.useRealTimers()
  })
})
