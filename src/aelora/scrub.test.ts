import { describe, expect, it } from 'vitest'
import { scrubToolLeaks } from './scrub'

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
