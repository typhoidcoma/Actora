import type { Transition } from 'motion/react'

/** The house spring: quick, settled, no wobble. Used for every morph. */
export const morph: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }

/** Softer spring for ambient movement (orb docking, sibling fades). */
export const glide: Transition = { type: 'spring', stiffness: 220, damping: 30 }

/** Liquid press for glass surfaces: squish in, overshoot slightly on release. */
export const jelly = {
  scale: 0.955,
  transition: { type: 'spring', stiffness: 520, damping: 14, mass: 0.7 },
} as const

/** Instant press feedback. */
export const press = { scale: 0.965, transition: { type: 'spring', stiffness: 600, damping: 30 } } as const
