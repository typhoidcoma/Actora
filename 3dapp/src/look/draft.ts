import { create } from 'zustand'

/** What the user is typing in the home message box (Overlay), kept across focus changes. */
export const useDraft = create<{ text: string }>(() => ({ text: '' }))
