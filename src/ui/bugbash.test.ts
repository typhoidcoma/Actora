import { describe, expect, it } from 'vitest'
import { scrubToolLeaks } from '../aelora/scrub'
import { shortLabel } from '../options/label'
import { validDay } from './format'
import { linkParts } from './markdownText'

describe('bug bash', () => {
  it('links in notes: no trailing punctuation, balanced parens, markdown labels', () => {
    expect(linkParts('See https://x.com/a. Thanks')).toEqual([
      'See ',
      { href: 'https://x.com/a', label: 'x.com/a' },
      '. Thanks',
    ])
    expect(linkParts('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
      '(',
      { href: 'https://en.wikipedia.org/wiki/Foo_(bar)', label: 'en.wikipedia.org/wiki/Foo_(bar)' },
      ')',
    ])
    expect(linkParts('Read [the story](https://n.com/s) now')).toEqual([
      'Read ',
      { href: 'https://n.com/s', label: 'the story' },
      ' now',
    ])
  })

  it('a typed date only counts when complete and sensible', () => {
    expect(validDay('0002-10-15', '2026-10-09')).toBe(false)
    expect(validDay('2026-10-08', '2026-10-09')).toBe(false)
    expect(validDay('2026-10-15', '2026-10-09')).toBe(true)
    expect(validDay('2099-01-01', '2026-10-09')).toBe(false)
  })

  it('the cleaner keeps prose with an unclosed action, and handles one nested in another', () => {
    expect(scrubToolLeaks('Switched with theme.set (dusk — enjoy!')).toBe('Switched with theme.set (dusk — enjoy!')
    expect(scrubToolLeaks('Done. [options.set]{options:[{label:open,say:chat.open{}}]} Enjoy.')).toBe('Done. Enjoy.')
  })

  it('a label is never empty', () => {
    expect(shortLabel('(a very long parenthetical aside that says nothing)')).not.toBe('')
  })
})
