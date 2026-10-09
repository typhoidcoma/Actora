import { describe, expect, it } from 'vitest'
import { sayLinks, scrubToolLeaks } from './scrub'

describe('scrubToolLeaks', () => {
  it('drops a tool call the model wrote into its reply', () => {
    const leaked =
      'perform_reaction{anchor:the perfect post-lunch escape,intensity:low,trigger:decision_making}perfect. i blocked 1:30 pm.'
    expect(scrubToolLeaks(leaked)).toBe('perfect. i blocked 1:30 pm.')
    expect(scrubToolLeaks('Done. ui_action(reader.open) Enjoy!')).toBe('Done. Enjoy!')
    expect(scrubToolLeaks('remember(content: "likes jazz") Noted!')).toBe('Noted!')
  })

  it('holds back a call still arriving, then shows the reply once it closes', () => {
    expect(scrubToolLeaks('perform_reaction{anchor:the per', true)).toBe('')
    expect(scrubToolLeaks('perform_reaction{anchor:x}perfect', true)).toBe('perfect')
  })

  it('lifts say: answer links out of the text', () => {
    const reply =
      "want to keep this open for the team sync?\n\n[keep it open for the meeting](say:yes, keep this reader open)\n[close it, i'll review it later](say:close the reader for now)"
    expect(scrubToolLeaks(reply)).toBe('want to keep this open for the team sync?')
    expect(sayLinks(reply)).toEqual([
      { label: 'keep it open for the meeting', say: 'yes, keep this reader open' },
      { label: "close it, i'll review it later", say: 'close the reader for now' },
    ])
    expect(scrubToolLeaks('open it?\n\n[keep it op', true)).toBe('open it?\n\n')
    expect(scrubToolLeaks('open it?\n\n[keep it](sa', true)).toBe('open it?\n\n')
    expect(scrubToolLeaks('see [the docs](https://x.dev) now')).toBe('see [the docs](https://x.dev) now')
  })

  it('catches calls written with Markdown escapes or a capital', () => {
    const t =
      'perform\\_reaction\\{anchor:overcast, wet pavement,intensity:low,trigger:decision\\_making\\}done. moody.'
    expect(scrubToolLeaks(t)).toBe('done. moody.')
    expect(scrubToolLeaks('Perform_reaction{anchor:x}Done.')).toBe('Done.')
  })

  it('handles the real leak: a backticked call, then answer links as bullets', () => {
    const raw =
      "`perform_reaction`{anchor:write down two bullets,intensity:low,trigger:decision_making}let's shrink this down.\n\ngo get 'em!\n\n* [done with both, ready to head in](say:done, heading into the sync now)\n* [help me draft the two questions](say:help me draft the two questions)"
    expect(scrubToolLeaks(raw)).toBe("let's shrink this down.\n\ngo get 'em!")
    expect(sayLinks(raw).map((l) => l.say)).toEqual([
      'done, heading into the sync now',
      'help me draft the two questions',
    ])
    expect(scrubToolLeaks('**perform_reaction**{anchor:x}ok')).toBe('ok')
    let acc = ''
    for (const ch of raw.slice(0, 120)) {
      acc += ch
      expect(scrubToolLeaks(acc, true)).not.toMatch(/`|perform|[{}]/)
    }
    // Ordinary code and bold stay.
    expect(scrubToolLeaks('Run `npm install` then **relax**.')).toBe('Run `npm install` then **relax**.')
  })

  it('never flashes the start of a call while streaming', () => {
    const t = 'perform_reaction{anchor:my bad,intensity:high,trigger:question_confusion}my bad, i blanked'
    let acc = ''
    for (const ch of t) {
      acc += ch
      expect(scrubToolLeaks(acc, true)).not.toMatch(/^p|[{}]/)
    }
    expect(scrubToolLeaks(t)).toBe('my bad, i blanked')
  })

  it('leaves ordinary text alone', () => {
    for (const t of [
      'Your 3pm (with Sam) moved to 4.',
      'Use {curly} braces in the template.',
      'Try the remember button (top right).',
      'Lunch at noon {probably}',
      "You should remember (it's important).",
    ])
      expect(scrubToolLeaks(t)).toBe(t)
  })
})
