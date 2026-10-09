import { describe, expect, it } from 'vitest'
import { actionArgs, strayAction } from './actions'

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
})
