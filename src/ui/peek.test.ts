import { afterEach, describe, expect, it, vi } from 'vitest'
import { ui, useUi } from '../stores/ui'
import { PEEK_MS, peekThenChat, peeking, stopPeek } from './peek'

/** A window whose listeners the test can fire. */
function fakeWindow() {
  const handlers = new Map<string, Set<() => void>>()
  vi.stubGlobal('window', {
    addEventListener: (e: string, fn: () => void) => handlers.set(e, (handlers.get(e) ?? new Set()).add(fn)),
    removeEventListener: (e: string, fn: () => void) => handlers.get(e)?.delete(fn),
  })
  return {
    fire: (e: string) => [...(handlers.get(e) ?? [])].forEach((fn) => fn()),
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
  }
}

afterEach(() => {
  stopPeek()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a glance at what she opened', () => {
  it('goes back to the chat after a few seconds', () => {
    vi.useFakeTimers()
    fakeWindow()
    ui.openChat()
    peekThenChat(() => ui.openVault())
    expect(useUi.getState()).toMatchObject({ vault: true, chatOpen: false })
    expect(peeking()).toBe(true)
    vi.advanceTimersByTime(PEEK_MS + 1)
    expect(useUi.getState()).toMatchObject({ vault: false, chatOpen: true })
    expect(peeking()).toBe(false)
  })

  it('stays if you touch it, and stops listening either way', () => {
    vi.useFakeTimers()
    const w = fakeWindow()
    ui.openChat()
    peekThenChat(() => ui.openPeople(null, 'profile'))
    expect(w.count()).toBe(3)
    w.fire('pointerdown')
    vi.advanceTimersByTime(PEEK_MS * 4)
    expect(useUi.getState()).toMatchObject({ people: true, chatOpen: false })
    expect(w.count()).toBe(0)
  })
})
