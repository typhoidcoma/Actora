import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast, useToast, withUndo } from './toast'
import { ui, useUi } from './ui'

describe('toast + undo window', () => {
  afterEach(() => vi.useRealTimers())

  it('commits after the window, unless Undo is tapped', () => {
    vi.useFakeTimers()
    const commit = vi.fn()
    const revert = vi.fn()
    withUndo('Deleted "A"', () => {}, commit, revert, 5000)
    expect(useToast.getState().toasts.at(-1)?.text).toBe('Deleted "A"')
    vi.advanceTimersByTime(5001)
    expect(commit).toHaveBeenCalledOnce()
    expect(revert).not.toHaveBeenCalled()

    const commit2 = vi.fn()
    const revert2 = vi.fn()
    withUndo('Deleted "B"', () => {}, commit2, revert2, 5000)
    useToast.getState().toasts.at(-1)?.undo?.()
    vi.advanceTimersByTime(6000)
    expect(revert2).toHaveBeenCalledOnce()
    expect(commit2).not.toHaveBeenCalled()
  })

  it("a second delete (or any toast) doesn't take away the first delete's Undo", () => {
    vi.useFakeTimers()
    const revertA = vi.fn()
    withUndo('Deleted "A"', () => {}, vi.fn(), revertA, 5000)
    withUndo('Deleted "B"', () => {}, vi.fn(), vi.fn(), 5000)
    toast.error('Something else went wrong')
    const a = useToast.getState().toasts.find((t) => t.text === 'Deleted "A"')
    expect(a?.undo).toBeDefined()
    a?.undo?.()
    expect(revertA).toHaveBeenCalledOnce()
    toast.dismiss()
  })

  it('newest toast wins, and dismiss only clears its own', () => {
    const a = toast.show('one')
    toast.show('two')
    toast.dismiss(a)
    expect(useToast.getState().toasts.at(-1)?.text).toBe('two')
  })
})

describe('selecting one occurrence of a repeating event', () => {
  it('treats occurrences as different rows', () => {
    ui.focus('calendar')
    ui.select({ kind: 'event', id: 'e1', occurrence: '2026-10-13T16:00:00Z' })
    expect(useUi.getState().selected?.occurrence).toBe('2026-10-13T16:00:00Z')
    // Tapping another occurrence of the same series selects it, not toggles off.
    ui.select({ kind: 'event', id: 'e1', occurrence: '2026-10-20T16:00:00Z' })
    expect(useUi.getState().selected?.occurrence).toBe('2026-10-20T16:00:00Z')
  })

  it('a delete opened from a list returns to that list', () => {
    ui.focus('tasks')
    ui.askDelete({ kind: 'task', id: 't1' })
    expect(useUi.getState()).toMatchObject({ focus: null, selected: { id: 't1' }, back: 'tasks' })
    ui.leaveItem()
    expect(useUi.getState()).toMatchObject({ focus: 'tasks', selected: null })
  })
})
