import { describe, expect, it } from 'vitest'
import { LABEL_MAX, shortLabel } from './label'

describe('shortLabel', () => {
  it('leaves short labels alone (bar a trailing period)', () => {
    expect(shortLabel('Plan my day')).toBe('Plan my day')
    expect(shortLabel('Yes please')).toBe('Yes please')
    expect(shortLabel('What else?')).toBe('What else?')
  })

  it('drops filler openers', () => {
    expect(shortLabel('Yes, draft the two questions')).toBe('Draft the two questions')
    expect(shortLabel('Can you move it to tomorrow?')).toBe('Move it to tomorrow')
    expect(shortLabel("Let's do the 10-minute email")).toBe('Do the 10-minute email')
  })

  it('cuts long ones to a clean phrase: first clause, else whole words, never an ellipsis', () => {
    expect(shortLabel('Keep it open for the meeting, then close it')).toBe('Keep it open')
    const cases = [
      "close it, i'll review it later",
      'Done with both, ready to head in',
      'Help me draft the two questions for Steve and Kham before the sync',
      'Summarize the WebGPU limits and what they mean for our renderer',
      'Got it: Design sync in 40 min',
    ]
    for (const c of cases) {
      const l = shortLabel(c)
      expect(l.length, l).toBeLessThanOrEqual(LABEL_MAX)
      expect(l, l).not.toMatch(/…|\.\.\.|\s(the|to|for|and|of|with)$/i)
      expect(l.split(' ').length, l).toBeGreaterThanOrEqual(2)
    }
    expect(shortLabel("close it, i'll review it later")).toBe('Close it')
    expect(shortLabel('Done with both, ready to head in')).toBe('Done with both')
  })

  it('reads as a button on real labels', () => {
    expect(shortLabel('help me draft the two questions')).toBe('Draft the two questions')
    expect(shortLabel('Got it: Design sync in 40 min')).toBe('Got it: Design sync')
    expect(shortLabel('Summarize the WebGPU limits')).toBe('Summarize the WebGPU')
  })
})
