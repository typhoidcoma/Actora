/**
 * The welcome: when the app opens (wide screens), the camera starts pulled back
 * on the room and she walks in from the left to her spot; as she arrives it
 * eases in to the usual view. `pending` until the scene is revealed, `active`
 * while she walks in; the character and the camera rig read it.
 */
export const intro = { pending: true, active: false }

/** Where she enters from, relative to her spot (metres): screen left, a step back. */
export const INTRO_FROM = { x: -2.8, z: -0.3 }
