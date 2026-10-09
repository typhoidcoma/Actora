import { create } from 'zustand'

/**
 * unsupported   no service worker / PushManager, or push is off server-side
 * needs-install iOS Safari tab: push only works from the home-screen app
 * off           supported, not subscribed (permission default or granted)
 * on            subscribed and registered with Aelora
 * denied        the user blocked notifications (terminal; only browser settings can undo it)
 */
export type PushStatus = 'unknown' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied'

export interface PushState {
  status: PushStatus
  /** "Not now" snooze for the reminder offer (epoch ms). */
  snoozedUntil: number | null
}

const SNOOZE_KEY = 'actora.push.snooze'

function readSnooze(): number | null {
  try {
    const v = Number(localStorage.getItem(SNOOZE_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

export const usePush = create<PushState>(() => ({ status: 'unknown', snoozedUntil: readSnooze() }))

export function snoozePushOffer(days = 7): void {
  const until = Date.now() + days * 86_400_000
  try {
    localStorage.setItem(SNOOZE_KEY, String(until))
  } catch {
    /* private mode */
  }
  usePush.setState({ snoozedUntil: until })
}
