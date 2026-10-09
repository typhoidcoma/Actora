import { create } from 'zustand'

/**
 * Quick feedback for something the user just did ("Done: Wire the shader ·
 * Undo"), or that just failed. One at a time, newest wins, shown above the rail
 * on every screen (phone panels included, where Wendy's line is hidden).
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
  toast: Toast | null
}

export const useToast = create<ToastState>(() => ({ toast: null }))

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

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
    useToast.setState({ toast: t })
    clearTimeout(timer)
    timer = setTimeout(() => toast.dismiss(t.id), t.ms)
    return t.id
  },
  error(text: string, opts: Partial<Omit<Toast, 'id' | 'text' | 'tone'>> = {}): number {
    return toast.show(text, { ...opts, tone: 'error' })
  },
  /** Dismiss (only if it's still the one showing). */
  dismiss(id?: number) {
    if (id === undefined || useToast.getState().toast?.id === id) useToast.setState({ toast: null })
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
