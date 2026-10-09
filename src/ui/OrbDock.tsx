import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { toggleVoice } from '../options/run'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { useOptionsStore } from '../stores/options'
import { ui, useUi } from '../stores/ui'
import { glide } from './motion'
import { Orb } from './orb/Orb'

/** The visible blob is 60% of the canvas box; the rest is glow. */
const BLOB = 0.6

/**
 * One persistent orb that glides between three anchors, using transforms only:
 * the grid centre, the header of a focused tile, or the chat header.
 * It stays mounted, so the WebGL context is created once. At rest it floats on
 * a slow Lissajous path and breathes, so it never looks frozen.
 */
export function OrbDock() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus !== null || s.selected !== null || s.reader)
  const chatOpen = useUi((s) => s.chatOpen)
  const [pressed, setPressed] = useState(false)
  const [hover, setHover] = useState(false)
  const reduced = useReducedMotion()
  const listening = useOptionsStore((s) => s.listening)
  const phase = useAgent((s) => s.phase)

  const box = m.orb / BLOB
  let blob = m.orb
  let cx = m.cx
  let cy = m.cy
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
  const resting = !chatOpen && !focus

  // Idle life: float + breath, on an inner layer so it composes with docking.
  const fx = useMotionValue(0)
  const fy = useMotionValue(0)
  const breath = useMotionValue(1)
  const settle = useRef(0)
  useAnimationFrame((t) => {
    const s = t / 1000
    // Ease the float in and out as the orb docks/undocks instead of snapping.
    settle.current += ((resting && !pressed ? 1 : 0) - settle.current) * 0.06
    const amp = reduced ? 0 : settle.current
    fx.set(Math.sin(s * 0.53) * 3.5 * amp)
    fy.set(Math.sin(s * 0.37 + 1.2) * 2.5 * amp)
    breath.set(1 + Math.sin((s / 5) * Math.PI * 2) * (reduced ? 0.01 : 0.02) * Math.max(0.3, settle.current))
  })

  // The orb is the microphone: tap to talk (tap again to stop), hold to open the chat.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  const down = () => {
    setPressed(true)
    held.current = false
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      held.current = true
      setPressed(false)
      if (!chatOpen) ui.openChat()
    }, HOLD_MS)
  }
  const up = () => {
    setPressed(false)
    clearTimeout(holdTimer.current)
  }

  return (
    <motion.div
      className="pointer-events-none fixed top-0 left-0 z-30"
      style={{ width: box, height: box }}
      initial={false}
      animate={{ x: cx - box / 2, y: cy - box / 2, scale }}
      transition={pressed ? { type: 'spring', stiffness: 700, damping: 30 } : glide}
    >
      <motion.div className="absolute inset-0" style={{ x: fx, y: fy, scale: breath }}>
        <Orb />
        <ListeningRings on={listening} />
        <MicHint on={hover && !listening && phase !== 'offline'} />
      </motion.div>
      <button
        aria-label={listening ? 'Stop listening' : 'Talk to Wendy'}
        aria-pressed={listening}
        title="Tap to talk · hold for chat"
        className="pointer-events-auto absolute inset-[20%] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        onPointerDown={down}
        onPointerUp={up}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => {
          up()
          setHover(false)
        }}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (held.current) return
          toggleVoice()
        }}
      />
    </motion.div>
  )
}

const HOLD_MS = 450

/** Soft rings breathing out from the blob while the mic is open. */
function ListeningRings({ on }: { on: boolean }) {
  return (
    <AnimatePresence>
      {on &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-[20%] rounded-full"
            style={{ boxShadow: 'inset 0 0 0 2px var(--mood-1, #A7C5BD)' }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0.7, 0], scale: [1, 1.45] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
          />
        ))}
    </AnimatePresence>
  )
}

/**
 * Mic glyph shown on mouse hover only (touch users just tap), sitting two-thirds
 * of the way down the visible blob. The blob spans 20–80% of the box, so 2/3
 * down the blob is 60% down the box.
 */
function MicHint({ on }: { on: boolean }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 24 24"
      className="absolute top-[60%] left-1/2 h-[12%] w-[12%] -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_1px_3px_rgb(42_34_48/0.45)]"
      initial={false}
      animate={{ opacity: on ? 0.95 : 0, scale: on ? 1 : 0.85, y: on ? 0 : 4 }}
      transition={{ duration: 0.25 }}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </motion.svg>
  )
}

/**
 * Hairline socket ring around the resting orb. It shares a layoutId with the
 * chat sheet, so opening chat morphs this circle into the panel.
 */
export function OrbSocket() {
  const m = useMetrics()
  const focus = useUi((s) => s.focus !== null || s.selected !== null || s.reader)
  const chatOpen = useUi((s) => s.chatOpen)
  if (chatOpen || focus) return null
  const d = m.orb + m.gap
  return (
    <motion.div
      layoutId="sheet"
      transition={glide}
      className="pointer-events-none fixed z-20"
      style={{
        left: m.cx - d / 2,
        top: m.cy - d / 2,
        width: d,
        height: d,
        borderRadius: d / 2,
        boxShadow: 'inset 0 0 0 1px var(--t-line)',
        background: 'radial-gradient(circle, var(--t-spec-soft), transparent 70%)',
      }}
    />
  )
}
