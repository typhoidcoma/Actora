import { useMetrics } from '@actora/stores/metrics'
import { panelOpen, sideBySide, useUi } from '@actora/stores/ui'

/** Something is open (chat, a card, a list, finds, the vault): the stage steps back, the camera comes in. */
export const useFocused = () => useUi((s) => s.chatOpen || panelOpen(s))

/**
 * The chat and another window both open on a wide screen: one wider panel holding
 * the two side by side, and the camera steps back so she still fits beside it.
 */
export const usePaired = () => {
  const both = useUi(sideBySide)
  const split = useMetrics((s) => s.split)
  return both && split
}
/** The same, for per-frame code. */
export const pairedNow = () => sideBySide(useUi.getState()) && useMetrics.getState().split

/** Wide enough for the two windows side by side (phones and narrow windows: one at a time). */
export const roomForTwo = (vw: number, vh: number) => vw >= 1100 && vw / vh >= 1.4
