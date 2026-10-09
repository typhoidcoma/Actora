import { describe, expect, it } from 'vitest'
import { copyableText } from './markdownText'

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
