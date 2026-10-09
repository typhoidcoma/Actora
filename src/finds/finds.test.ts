import { describe, expect, it } from 'vitest'
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
