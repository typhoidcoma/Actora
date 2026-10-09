import type { PointerEvent } from 'react'

// Moves a glass surface's specular highlight under the finger and brightens it
// on press. Writes CSS custom properties directly (no React state), and the
// properties are registered with @property, so the sheen glides.

function place(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
}

function release(e: PointerEvent<HTMLElement>) {
  e.currentTarget.style.setProperty('--press', '0')
}

export const sheen = {
  onPointerDown(e: PointerEvent<HTMLElement>) {
    place(e)
    e.currentTarget.style.setProperty('--press', '1')
  },
  onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse' || e.buttons) place(e)
  },
  onPointerUp: release,
  onPointerCancel: release,
  onPointerLeave: release,
}
