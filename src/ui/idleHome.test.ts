import { afterEach, describe, expect, it, vi } from 'vitest'

// Node has no window; the timer only needs add/removeEventListener.
Object.assign(globalThis, {
  window: { addEventListener: () => {}, removeEventListener: () => {}, getSelection: () => null },
  document: { addEventListener: () => {}, removeEventListener: () => {} },
})

const { startIdleHome } = await import('./idleHome')
const { ui, useUi } = await import('../stores/ui')
const { useAgent } = await import('../stores/agent')

describe('idle → home', () => {
  afterEach(() => vi.useRealTimers())

  it('a quiet conversation goes home fast; other panels wait longer', () => {
    vi.useFakeTimers()
    const stop = startIdleHome(500, 1000)
    ui.openChat()
    vi.advanceTimersByTime(501)
    expect(useUi.getState().chatOpen).toBe(false)
    ui.focus('goals')
    vi.advanceTimersByTime(600)
    expect(useUi.getState().focus).toBe('goals')
    vi.advanceTimersByTime(500)
    expect(useUi.getState().focus).toBeNull()
    stop()
  })

  it('closes whatever is open after the idle time', () => {
    vi.useFakeTimers()
    const stop = startIdleHome(500, 1000)
    ui.focus('tasks')
    vi.advanceTimersByTime(999)
    expect(useUi.getState().focus).toBe('tasks')
    vi.advanceTimersByTime(2)
    expect(useUi.getState().focus).toBeNull()
    stop()
  })

  it('waits while Wendy is mid-turn, then goes home once she is done', () => {
    vi.useFakeTimers()
    const stop = startIdleHome(500, 1000)
    useAgent.setState({ turnId: 'c1', awaitingTurn: false, streaming: '' })
    ui.openReader()
    vi.advanceTimersByTime(1500)
    expect(useUi.getState().reader).toBe(true)
    useAgent.setState({ turnId: null, streaming: null })
    vi.advanceTimersByTime(501)
    expect(useUi.getState().reader).toBe(false)
    stop()
  })
})
