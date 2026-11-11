import { beforeEach, describe, expect, it } from 'vitest'

// Rule 4: Aelora passes her arguments through unchecked, so the app checks every one.
const mem = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
})

const { useAgent } = await import('../stores/agent')
const { useUi, ui } = await import('../stores/ui')
const { routeFrame, schemeArgs } = await import('./router')

const bus = { send: () => true, subscribe: () => () => {} }
const command = (cmd: Record<string, unknown>) =>
  routeFrame({ type: 'event', event: 'agent_command', data: { command: cmd } }, bus)

describe('her arguments, checked', () => {
  beforeEach(() => {
    useAgent.setState({ reaction: null })
    ui.closeAll()
  })

  it('colors.set keeps only scheme keys and hex colours', () => {
    expect(
      schemeArgs({
        seed: '#7c3aed',
        accent: 'not a colour',
        calm: '#0c8',
        harmony: 'triadic',
        ambient: ['#111', 'red', '#222222', 42],
        orb: ['#abc', '#def', '#123', '#456'],
        evil: 'x'.repeat(5000),
        __proto__: { polluted: true },
      }),
    ).toEqual({ seed: '#7c3aed', calm: '#0c8', harmony: 'triadic', ambient: ['#111', '#222222'], orb: ['#abc', '#def', '#123'] })
  })

  it('avatar.react: an unknown bus is dropped; strength and length are clamped', () => {
    command({ type: 'avatar.react', bus: 'explode', state: 'x' })
    expect(useAgent.getState().reaction).toBeNull()
    command({ type: 'avatar.react', bus: 'positive', state: 'joy', intensity: 40, holdMs: 9e9 })
    expect(useAgent.getState().reaction).toMatchObject({ bus: 'positive', intensity: 1.5, holdMs: 10_000 })
  })

  it('open_app ignores names that only exist on every object', () => {
    command({ type: 'open_app', id: 'constructor' })
    command({ type: 'open_app', id: 'toString' })
    expect(useUi.getState().focus).toBeNull()
  })

  it("a sequence whose steps aren't a list does nothing (and doesn't throw)", () => {
    expect(() => command({ type: 'sequence', steps: 'open everything' })).not.toThrow()
  })
})
