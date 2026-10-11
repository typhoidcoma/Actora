import { create } from 'zustand'

/** What the user is typing. A hidden <input> owns the keyboard; the 3D panel just shows it. */
export const useDraft = create<{ text: string; focused: boolean }>(() => ({ text: '', focused: false }))

let input: HTMLInputElement | null = null
export const draftInput = (el: HTMLInputElement | null) => {
  input = el
}
export const focusDraft = () => input?.focus()
