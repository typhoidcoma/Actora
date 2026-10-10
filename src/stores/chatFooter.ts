import { create } from 'zustand'

/** Where the open chat's footer (answers + message box) starts, so toasts sit above it, not on it. */
export const useChatFooter = create<{ top: number | null }>(() => ({ top: null }))
