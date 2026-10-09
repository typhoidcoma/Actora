import { motion } from 'motion/react'
import { useState } from 'react'
import { useMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { glide } from './motion'
import { Orb } from './orb/Orb'

/** The visible blob is 60% of the canvas box; the rest is glow. */
const BLOB = 0.6

/**
 * One persistent orb that glides between three anchors, using transforms only:
 * the grid centre, the header of a focused tile, or the chat header.
 * It stays mounted, so the WebGL context is created once.
 */
export function OrbDock() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus)
  const chatOpen = useUi((s) => s.chatOpen)
  const [pressed, setPressed] = useState(false)

  const box = m.orb / BLOB
  let blob = m.orb
  let cx = m.vw / 2
  let cy = m.vh / 2
  if (chatOpen) {
    blob = 40
    cx = m.sheet.x + 22 + blob / 2
    cy = m.sheet.y + 18 + blob / 2
  } else if (focus) {
    // In the expanded tile's header, just left of its close button.
    blob = 40
    cx = m.gridX + m.gridW - 24 - 44 - 14 - blob / 2
    cy = m.gridY + 20 + 22
  }
  const scale = (blob / m.orb) * (pressed ? 0.9 : 1)

  return (
    <motion.div
      className="pointer-events-none fixed top-0 left-0 z-30"
      style={{ width: box, height: box }}
      initial={false}
      animate={{ x: cx - box / 2, y: cy - box / 2, scale }}
      transition={pressed ? { type: 'spring', stiffness: 700, damping: 30 } : glide}
    >
      <Orb />
      <button
        aria-label="Talk to Wendy"
        className="pointer-events-auto absolute inset-[20%] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lime/60"
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onClick={() => (chatOpen ? ui.closeChat() : ui.openChat())}
      />
    </motion.div>
  )
}

/**
 * Hairline socket ring around the resting orb. It shares a layoutId with the
 * chat sheet, so opening chat morphs this circle into the panel.
 */
export function OrbSocket() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus)
  const chatOpen = useUi((s) => s.chatOpen)
  if (chatOpen || focus) return null
  const d = m.orb + m.gap
  return (
    <motion.div
      layoutId="sheet"
      transition={glide}
      className="pointer-events-none fixed z-20"
      style={{
        left: (m.vw - d) / 2,
        top: (m.vh - d) / 2,
        width: d,
        height: d,
        borderRadius: d / 2,
        boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07)',
        background: 'radial-gradient(circle, rgb(255 255 255 / 0.025), transparent 70%)',
      }}
    />
  )
}
