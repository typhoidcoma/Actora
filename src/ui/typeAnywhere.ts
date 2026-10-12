import { useEffect } from 'react'
import { create } from 'zustand'
import { useUi } from '../stores/ui'

/** What the user is typing in the home message box, kept while panels open and close. */
export const useDraft = create<{ text: string }>(() => ({ text: '' }))

/**
 * Typing goes straight to the message box: a printable key pressed with nothing
 * to type into focuses the box for where they are (the chat's composer when it's
 * open, else the home box) and the keystroke lands there, first letter included.
 */
export function useTypeAnywhere(): void {
  useEffect(() => {
    const onType = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const at = document.activeElement as HTMLElement | null
      if (at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return
      const box = useUi.getState().chatOpen
        ? document.querySelector<HTMLElement>('[role="dialog"] textarea, [role="dialog"] input')
        : document.querySelector<HTMLElement>('input[aria-label="Message"]')
      if (box && box.offsetParent !== null) box.focus()
    }
    window.addEventListener('keydown', onType)
    return () => window.removeEventListener('keydown', onType)
  }, [])
}
