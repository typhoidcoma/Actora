import { describe, expect, it } from 'vitest'
import { actionArgs, looseArgs, strayAction } from './actions'

describe('ui_actions called as tools', () => {
  it('recognises our actions by tool name, not real tools', () => {
    expect(strayAction('colors_set')).toBe('colors.set')
    expect(strayAction('colors.set')).toBe('colors.set')
    expect(strayAction('unknown_tool:theme_set')).toBe('theme.set')
    expect(strayAction('ui_action')).toBeNull()
    expect(strayAction('create_task')).toBeNull()
    expect(strayAction(undefined)).toBeNull()
  })

  it('reads their args from the summary, unwrapping {action, args}', () => {
    expect(actionArgs('{"seed":"#2EDDBA"}')).toEqual({ seed: '#2EDDBA' })
    expect(actionArgs('{"action":"theme.set","args":{"mode":"dusk"}}')).toEqual({ mode: 'dusk' })
    expect(actionArgs('')).toEqual({})
    expect(actionArgs('{"seed":"#2ED')).toBeNull()
  })

  it('reads loose arguments, and keeps what survived a cut-off call', () => {
    // As she writes them into a reply: keys and words unquoted.
    expect(looseArgs('seed: #7c3aed, harmony: analogous, hours: 2')).toEqual({
      seed: '#7c3aed',
      harmony: 'analogous',
      hours: 2,
    })
    expect(looseArgs("{mode: 'dusk'}")).toEqual({ mode: 'dusk' })
    // The server trims a call's arguments to 200 characters: every complete pair still counts.
    expect(actionArgs('{"accent":"#ff0066","urgent":"#ff3300","calm":"#00cc88","task":"#22')).toEqual({
      accent: '#ff0066',
      urgent: '#ff3300',
      calm: '#00cc88',
    })
  })
})

describe('screen actions in the activity trail', () => {
  it('names the worthwhile ones and hides routine ones', async () => {
    const { describeUiAction, uiActionName } = await import('./activity')
    expect(uiActionName('{"action":"colors.set","args":{"seed":"#123456"}}')).toBe('colors.set')
    expect(uiActionName('{"action":"options.se')).toBeNull()
    expect(describeUiAction('colors.set')?.done).toBe('Restyled the app')
    expect(describeUiAction('options.set')).toBeNull()
    expect(describeUiAction('card.open')).toBeNull()
    expect(describeUiAction(null)).toBeNull()
  })
})
