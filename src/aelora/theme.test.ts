import { afterEach, describe, expect, it, vi } from 'vitest'
import { runUiAction } from './router'
import { resetColors, useScheme } from '../stores/scheme'
import { useUi } from '../stores/ui'

afterEach(() => {
  resetColors()
  useUi.setState({ theme: 'auto' })
  vi.restoreAllMocks()
})

describe('she changes the look', () => {
  it('theme.set takes her words for it', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    for (const [said, mode] of [
      [{ mode: 'dusk' }, 'dusk'],
      [{ mode: 'Dark' }, 'dusk'],
      [{ mode: 'night' }, 'dusk'],
      [{ mode: 'light' }, 'day'],
      [{ theme: 'day' }, 'day'],
      [{ mode: 'system' }, 'auto'],
    ] as const) {
      useUi.setState({ theme: mode === 'auto' ? 'day' : 'auto' })
      runUiAction('theme.set', said)
      expect(useUi.getState().theme).toBe(mode)
    }
  })

  it('an unknown mode leaves the theme and says why', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useUi.setState({ theme: 'day' })
    runUiAction('theme.set', { mode: 'neon' })
    expect(useUi.getState().theme).toBe('day')
    expect(warn).toHaveBeenCalledWith('[her action] refused', 'theme.set', '(unknown mode)', { mode: 'neon' })
  })

  it('colors.set repaints, and colors.reset goes back to the brand', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runUiAction('colors.set', { seed: '#7c3aed', harmony: 'analogous', hours: 4 })
    expect(useScheme.getState()).toMatchObject({ source: 'agent', input: { seed: '#7c3aed', harmony: 'analogous' } })
    runUiAction('colors.reset', {})
    expect(useScheme.getState().source).toBe('brand')
    // Neither is turned down as an unknown action.
    expect(warn).not.toHaveBeenCalled()
  })
})
