import { describe, expect, it } from 'vitest'
import { copyableText, liveTail } from './markdownText'

describe('copyableText', () => {
  it('keeps paragraphs and lists, spells out links, drops marks and images', () => {
    const md = [
      '## Plan for today',
      '',
      'Start with **the report**, then _stretch_.',
      '',
      '* Read [Earshot](https://earshot.org) lineup',
      '* Book `7pm`',
      '',
      '![poster](https://x.test/p.jpg)',
    ].join('\n')
    expect(copyableText(md)).toBe(
      'Plan for today\n\nStart with the report, then stretch.\n\n- Read Earshot (https://earshot.org) lineup\n- Book 7pm',
    )
  })
})

describe('liveTail (her latest words while she types outside the chat)', () => {
  it('keeps short text whole', () => {
    expect(liveTail('Sure. On it.', 150)).toBe('Sure. On it.')
  })
  it('keeps the last whole sentences that fit', () => {
    const t = 'First sentence is here. Second one is a bit longer than that. Third is what she is typing now'
    expect(liveTail(t, 70)).toBe('…Second one is a bit longer than that. Third is what she is typing now')
  })
  it('one long sentence still arriving: its last words, from a word boundary', () => {
    const t = 'word '.repeat(60) + 'newest'
    const out = liveTail(t, 40)
    expect(out.startsWith('…word')).toBe(true)
    expect(out.endsWith('newest')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(40)
  })
})
