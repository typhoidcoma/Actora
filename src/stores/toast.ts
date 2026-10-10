import { create } from 'zustand'

/**
 * Quick feedback for something the user just did ("Done: Wire the shader ·
 * Undo"), or that just failed. A small stack (newest at the bottom), shown
 * above the rail on every screen (phone panels included, where Wendy's line is
 * hidden). Each toast keeps its own timer, so a new one never takes away an
 * earlier one's Undo while its window is still open.
 */
export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
  /** Shown as an Undo button; runs once, then the toast goes. */
  undo?: () => void
  /** Another action instead of Undo (e.g. "Connect"). */
  action?: { label: string; run: () => void }
  ms: number
}

interface ToastState {
  toasts: Toast[]
}

export const useToast = create<ToastState>(() => ({ toasts: [] }))

const MAX = 3
let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const toast = {
  show(text: string, opts: Partial<Omit<Toast, 'id' | 'text'>> = {}): number {
    const t: Toast = {
      id: ++seq,
      text,
      tone: opts.tone ?? 'ok',
      undo: opts.undo,
      action: opts.action,
      ms: opts.ms ?? (opts.undo ? 6000 : 4000),
    }
    useToast.setState((s) => {
      let list = [...s.toasts.filter((x) => x.text !== text), t]
      // Too many: the oldest without an Undo goes first (an open Undo is kept as long as possible).
      while (list.length > MAX) {
        const drop = list.find((x) => !x.undo) ?? list[0]
        list = list.filter((x) => x !== drop)
      }
      return { toasts: list }
    })
    timers.set(
      t.id,
      setTimeout(() => toast.dismiss(t.id), t.ms),
    )
    return t.id
  },
  error(text: string, opts: Partial<Omit<Toast, 'id' | 'text' | 'tone'>> = {}): number {
    return toast.show(text, { ...opts, tone: 'error' })
  },
  /** Dismiss one toast (or all). */
  dismiss(id?: number) {
    if (id === undefined) {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
      return useToast.setState({ toasts: [] })
    }
    clearTimeout(timers.get(id))
    timers.delete(id)
    useToast.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  },
}

/**
 * Do something now, with an Undo window: `apply` runs at once (optimistic),
 * `commit` only once the window closes without Undo, `revert` on Undo.
 */
export function withUndo(text: string, apply: () => void, commit: () => void, revert: () => void, ms = 5000): void {
  apply()
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    pending.delete(finish)
    commit()
  }
  pending.add(finish)
  const id = toast.show(text, {
    ms,
    undo: () => {
      if (settled) return
      settled = true
      pending.delete(finish)
      revert()
    },
  })
  setTimeout(() => {
    finish()
    toast.dismiss(id)
  }, ms)
}

/** Commits still inside their Undo window: sent right away if the page goes away. */
const pending = new Set<() => void>()
/** Send every commit still waiting out its Undo window (sign-out, page going away). */
export function flushPendingCommits(): void {
  for (const f of [...pending]) f()
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPendingCommits)
