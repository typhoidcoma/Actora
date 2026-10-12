import { create } from 'zustand'

/**
 * Everything the first frame needs, so the scene is revealed whole instead of
 * popping in: the character, the fonts, the room's reflections, every shader
 * compiled (the first-frame hitches), and the user's data. A hard ceiling makes
 * sure it never hangs on one that doesn't come.
 */
interface Ready {
  model: boolean
  fonts: boolean
  env: boolean
  compiled: boolean
  data: boolean
  /** All in (or the ceiling passed): the loader fades and the UI makes its entrance. */
  ready: boolean
}

const CEILING_MS = 12_000

export const useReady = create<Ready>(() => ({ model: false, fonts: false, env: false, compiled: false, data: false, ready: false }))

/** Mark one piece done; the scene is ready when all are. */
export function markReady(part: Exclude<keyof Ready, 'ready'>): void {
  const s = useReady.getState()
  if (s[part]) return
  const next = { ...s, [part]: true }
  next.ready = next.model && next.fonts && next.env && next.compiled && next.data
  useReady.setState(next)
}

setTimeout(() => useReady.setState({ ready: true }), CEILING_MS)
