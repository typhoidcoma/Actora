import { describe, expect, it, vi } from 'vitest'
import { localOptions } from '../options/local'
import { parseFinds, unseenCount } from './finds'

const one = {
  title: 'Puffy planet',
  blurb: 'Fluffy.',
  why: 'Space!',
  url: 'https://nasa.gov/x',
  image: 'https://img/x.jpg',
  source: 'NASA',
  tag: 'Nerdy',
}

describe('parseFinds', () => {
  it('reads a fenced JSON block, dropping items without a title or http url, deduping by url', () => {
    const text =
      'Here you go!\n```json\n' +
      JSON.stringify({ finds: [one, { ...one }, { title: 'no url' }, { url: 'https://a.b' }] }) +
      '\n```'
    const finds = parseFinds(text)
    expect(finds).toHaveLength(1)
    expect(finds[0]).toMatchObject({ title: 'Puffy planet', image: 'https://img/x.jpg', tag: 'Nerdy' })
  })

  it('accepts a bare array and ignores non-http images', () => {
    const finds = parseFinds(JSON.stringify([{ ...one, image: 'javascript:alert(1)' }]))
    expect(finds[0].image).toBeNull()
  })

  it('falls back to Markdown links with the preceding image', () => {
    const finds = parseFinds('![pic](https://img/p.png)\n1. [Cool thing](https://cool.example.com/a) is neat')
    expect(finds).toEqual([
      expect.objectContaining({
        title: 'Cool thing',
        url: 'https://cool.example.com/a',
        image: 'https://img/p.png',
        source: 'cool.example.com',
      }),
    ])
  })

  it('counts unseen finds and builds Discover options', () => {
    const items = parseFinds(JSON.stringify([one, { ...one, url: 'https://two.example' }]))
    expect(unseenCount({ items, seen: [items[0].id] })).toBe(1)
    const snap = {
      entities: { tasks: {}, goals: {}, events: {}, notifications: {} },
      agent: { messages: [], line: 'greeting' as const, notice: null, turnId: null, awaitingTurn: false },
      push: { status: 'unsupported' as const, snoozedUntil: null },
      now: 0,
      finds: items,
    }
    expect(localOptions('finds', snap).map((o) => o.label)).toEqual(['Find me more', 'Surprise me'])
    expect(localOptions(`find:${items[0].id}`, snap).map((o) => o.label)).toEqual([
      'Tell me more',
      'More like this',
      'Save for later',
    ])
  })
})

describe('finds.set flow', () => {
  const item = (n: number) => ({
    title: `Find ${n}`,
    blurb: 'Fun.',
    why: 'You will like it',
    url: `https://example.com/${n}`,
    image: `https://example.com/${n}.jpg`,
    source: 'Example',
    tag: 'Nerdy',
  })
  const sent: Array<Record<string, unknown>> = []
  const bus = { send: (m: Record<string, unknown>) => (sent.push(m), true) } as never

  it('lands the cards with her Markdown note when the hunt finishes', async () => {
    const { adoptFindsUser, startFinds, hunt, handleFindsFrame, useFinds } = await import('./finds')
    const { runUiAction } = await import('../aelora/router')
    adoptFindsUser('u1')
    const stop = startFinds(bus)
    hunt()
    expect(sent.at(-1)).toMatchObject({ type: 'conversation.new' })
    handleFindsFrame({ type: 'conversation.created', conversationId: 'th' } as never)
    expect(sent.some((m) => m.type === 'conversation.rename' && m.title === 'Fun finds')).toBe(true)
    runUiAction('finds.set', { items: [item(1), item(2), { title: 'no url' }] })
    expect(useFinds.getState().status).toBe('hunting') // waits for her reply
    handleFindsFrame({ type: 'done', conversationId: 'th', text: 'Two **fun** things today.' } as never)
    expect(useFinds.getState()).toMatchObject({ status: 'ready', note: 'Two **fun** things today.' })
    expect(useFinds.getState().items.map((f) => f.title)).toEqual(['Find 1', 'Find 2'])
    stop()
  })

  it('falls back to her reply if finds.set never arrives', async () => {
    vi.useFakeTimers()
    const { startFinds, hunt, handleFindsFrame, useFinds } = await import('./finds')
    const stop = startFinds(bus)
    hunt()
    handleFindsFrame({
      type: 'done',
      conversationId: 'th',
      text: 'Look: [A comet](https://example.com/comet)',
    } as never)
    expect(useFinds.getState().status).toBe('hunting')
    vi.advanceTimersByTime(1600)
    expect(useFinds.getState().items.map((f) => f.title)).toEqual(['A comet'])
    stop()
    vi.useRealTimers()
  })

  it('updates the card straight away when she sets finds outside a hunt', async () => {
    const { useFinds } = await import('./finds')
    const { runUiAction } = await import('../aelora/router')
    runUiAction('finds.set', { items: [item(9)] })
    expect(useFinds.getState().items.map((f) => f.title)).toEqual(['Find 9'])
  })
})

describe('client_state', () => {
  it('names the client, sends the whole ui object, and every action has exactly one dot', async () => {
    const { sendClientState, AVAILABLE_ACTIONS } = await import('../aelora/router')
    const frames: Array<Record<string, unknown>> = []
    sendClientState({ send: (m: Record<string, unknown>) => (frames.push(m), true) } as never)
    const ui = frames[0].ui as Record<string, unknown>
    expect(ui.client).toBe('actora')
    expect(Object.keys(ui).sort()).toEqual(['animations', 'availableActions', 'client', 'screen'])
    expect(AVAILABLE_ACTIONS).toContain('finds.set')
    for (const a of AVAILABLE_ACTIONS) expect(a.split('.').length, a).toBe(2)
  })
})

describe("Wendy's headline", () => {
  it('takes her opening heading as the page title and keeps the rest as her note', async () => {
    const { splitHeadline } = await import('./finds')
    expect(splitHeadline('## Jazz week, **Tyler**\n\nEarshot is on all month.')).toEqual({
      headline: 'Jazz week, Tyler',
      body: 'Earshot is on all month.',
    })
    expect(splitHeadline('No heading here.')).toEqual({ headline: '', body: 'No heading here.' })
  })

  it('asks for a personal headline and one actionable offer, never a generic label', async () => {
    const { FIND_DIRECTIVE } = await import('./finds')
    expect(FIND_DIRECTIVE).toMatch(/personal headline/)
    expect(FIND_DIRECTIVE).toMatch(/one concrete thing you can do for me/)
    expect(FIND_DIRECTIVE).toMatch(/Never a generic label like "For you"/)
  })

  it('lands the headline as the title with the cards', async () => {
    const { startFinds, hunt, handleFindsFrame, useFinds } = await import('./finds')
    const { runUiAction } = await import('../aelora/router')
    const stop = startFinds({ send: () => true } as never)
    hunt()
    runUiAction('finds.set', { items: [{ title: 'Earshot', url: 'https://earshot.org' }] })
    handleFindsFrame({
      type: 'done',
      conversationId: 'th',
      text: '## Jazz week, Tyler\n\nWant it on Saturday?',
    } as never)
    expect(useFinds.getState()).toMatchObject({ headline: 'Jazz week, Tyler', note: 'Want it on Saturday?' })
    stop()
  })
})
