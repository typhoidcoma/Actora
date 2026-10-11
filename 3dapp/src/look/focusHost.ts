import { create } from 'zustand'

/**
 * The DOM element that stands in the scene as the focus panel (a CSS3DObject),
 * published by the scene so the DOM tree (Overlay) can portal the 2D content into it.
 * `w`/`h` are its CSS pixel size; the scene scales it to the panel's world size.
 */
export const useFocusHost = create<{ el: HTMLElement | null; w: number; h: number }>(() => ({ el: null, w: 0, h: 0 }))

/** Room kept at the panel's foot for its options (the 2D rail wraps to two rows), so they're never cut off. */
export const FOCUS_RAIL = 118
export const FOCUS_RADIUS = 18
