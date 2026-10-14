import { contextKeyOf, ui, useUi } from '../stores/ui'

/** How long something she opens mid-conversation stays up before the chat comes back. */
export const PEEK_MS = 5_000

let timer: ReturnType<typeof setTimeout> | undefined
let unlisten: (() => void) | null = null

function stop(): void {
  clearTimeout(timer)
  timer = undefined
  unlisten?.()
  unlisten = null
}

/**
 * While you're talking with her, what she opens (a card, a list, the Vault,
 * People) is a glance: it shows for a few seconds, then the chat comes back and
 * the conversation carries on. Touch it (tap, scroll, type) and it's yours: it
 * stays, and goes home on the usual idle clock instead.
 */
export function peekThenChat(open: () => void, ms = PEEK_MS): void {
  stop()
  open()
  if (typeof window !== 'undefined') {
    const keep = () => stop()
    // Moving the pointer over it counts too: on a desktop, that's someone looking at it.
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
    for (const e of events) window.addEventListener(e, keep, { capture: true, passive: true })
    unlisten = () => {
      for (const e of events) window.removeEventListener(e, keep, { capture: true })
    }
  }
  timer = setTimeout(() => {
    stop()
    if (!useUi.getState().chatOpen) ui.openChat()
  }, ms)
}

/** A glance is under way (she opened something and the chat will come back). */
export const peeking = (): boolean => timer !== undefined

/** Where what she offers belongs: the chat during a glance (it's coming back), else what's on screen. */
export const talkKey = (): string => (peeking() ? 'chat' : contextKeyOf(useUi.getState()))

/** For tests. */
export function stopPeek(): void {
  stop()
}
