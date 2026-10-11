import { useEffect, useRef, useState } from 'react'

/** Frame-rate independent exponential ease toward a target (lambda ~ 1/seconds). */
export const damp = (from: number, to: number, lambda: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-lambda * Math.min(dt, 0.1)))

/** Ease-out-back for scale-in: a little overshoot, like the 2D springs. */
export const backOut = (t: number) => {
  const c = 1.4
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

export interface Presence<T> {
  key: string
  item: T
  /** False once it has left the list: play the exit, then call done(). */
  present: boolean
  index: number
}

/**
 * Keeps items that left the list mounted until their exit finishes, the way
 * AnimatePresence does in the 2D app. Each entry calls done(key) when it's gone.
 */
export function usePresence<T>(items: T[], keyOf: (t: T) => string): [Presence<T>[], (key: string) => void] {
  const [leaving, setLeaving] = useState<Record<string, Presence<T>>>({})
  const prev = useRef<Map<string, Presence<T>>>(new Map())

  const now = new Map(items.map((item, index) => [keyOf(item), { key: keyOf(item), item, present: true, index }]))

  useEffect(() => {
    const gone: Record<string, Presence<T>> = {}
    for (const [key, p] of prev.current) if (!now.has(key)) gone[key] = { ...p, present: false }
    if (Object.keys(gone).length) setLeaving((l) => ({ ...l, ...gone }))
    // Something came back before its exit finished: it's present again.
    setLeaving((l) => {
      const back = Object.keys(l).filter((k) => now.has(k))
      if (!back.length) return l
      const next = { ...l }
      for (const k of back) delete next[k]
      return next
    })
    prev.current = now
  })

  const list = [...now.values(), ...Object.values(leaving).filter((p) => !now.has(p.key))]
  const done = (key: string) =>
    setLeaving((l) => {
      if (!(key in l)) return l
      const next = { ...l }
      delete next[key]
      return next
    })
  return [list, done]
}
