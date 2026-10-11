import { create } from 'zustand'

export const FONT = 'Satoshi, system-ui, -apple-system, "Segoe UI", sans-serif'

/** Canvas text can't wait on font-display: panels redraw once Satoshi has loaded. */
export const useFonts = create<{ ready: boolean }>(() => ({ ready: false }))

void Promise.all(['400 40px Satoshi', '500 40px Satoshi', '600 40px Satoshi', '700 40px Satoshi'].map((f) => document.fonts.load(f)))
  .catch(() => {})
  .finally(() => useFonts.setState({ ready: true }))
