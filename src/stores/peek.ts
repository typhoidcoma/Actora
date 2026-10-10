import { create } from 'zustand'

/** Whether her typing bar (TypingPeek) is up, so toasts can sit under it. */
export const usePeek = create<{ shown: boolean }>(() => ({ shown: false }))
