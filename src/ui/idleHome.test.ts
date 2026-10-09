import { afterEach, describe, expect, it, vi } from 'vitest'

// Node has no window; the timer only needs add/removeEventListener.
Object.assign(globalThis, { window: { addEventListener: () => {}, removeEventListener: () => {} } })

const { startIdleHome } = await import('./idleHome')
const { ui, useUi } = await import('../stores/ui')
const { useAgent } = await import('../stores/agent')

describe('idle → home', () => {
  afterEach(() => vi.useRealTimers())

  it('closes whatever is open after the idle time', () => {
    vi.useFakeTimers()
    const stop = startIdleHome(1000)
    ui.focus('tasks')
    vi.advanceTimersByTime(999)
    expect(useUi.getState().focus).toBe('tasks')
    vi.advanceTimersByTime(2)
    expect(useUi.getState().focus).toBeNull()
    stop()
  })

  it('waits while Wendy is mid-turn, then goes home once she is done', () => {
    vi.useFakeTimers()
    const stop = startIdleHome(1000)
    useAgent.setState({ turnId: 'c1', awaitingTurn: false, streaming: '' })
    ui.openReader()
    vi.advanceTimersByTime(1500)
    expect(useUi.getState().reader).toBe(true)
    useAgent.setState({ turnId: null, streaming: null })
    vi.advanceTimersByTime(1001)
    expect(useUi.getState().reader).toBe(false)
    stop()
  })
})
