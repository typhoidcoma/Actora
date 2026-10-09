import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { toggleVoice } from '../options/run'
import { useAgent, orbSignals } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { useOptionsStore } from '../stores/options'
import { ui, useUi, panelOpen } from '../stores/ui'
import { glide } from './motion'
import { Orb } from './orb/Orb'
import { DotRipple } from './DotRipple'

/** The visible blob is 60% of the canvas box; the rest is glow. */
const BLOB = 0.6
/** Orb size when it leads a panel header (Panel reserves room for it). */
/** The orb's size when it leads a panel header (Panel reserves this space on the left). */
const PANEL_ORB = 56

/**
 * One persistent orb that glides between three anchors, using transforms only:
 * the grid centre, the header of a focused tile, or the chat header.
 * It stays mounted, so the WebGL context is created once. At rest it floats on
 * a slow Lissajous path and breathes, so it never looks frozen.
 */
export function OrbDock() {
  const m = useMetrics()
  const focus = useUi(panelOpen)
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
    // Any open panel (list, item, finds, Vault): she leads the header, in front of its title.
    blob = PANEL_ORB
    cx = m.panel.x + 24 + blob / 2
    cy = m.panel.y + 20 + blob / 2
  }
  const scale = (blob / m.orb) * (pressed ? 0.9 : 1)
  const resting = !chatOpen && !focus

  // Idle life: float + breath, on an inner layer so it composes with docking.
  const fx = useMotionValue(0)
  const fy = useMotionValue(0)
  const breath = useMotionValue(1)
  const halo = useMotionValue(0.35)
  const settle = useRef(0)
  const pulse = useRef({ amp: 0.02, glow: 0.35 })
  useAnimationFrame((t) => {
    const s = t / 1000
    // Ease the float in and out as the orb docks/undocks instead of snapping.
    settle.current += ((resting && !pressed ? 1 : 0) - settle.current) * 0.06
    const amp = reduced ? 0 : settle.current
    fx.set(Math.sin(s * 0.53) * 3.5 * amp)
    fy.set(Math.sin(s * 0.37 + 1.2) * 2.5 * amp)

    // The pulse says what she's doing: a slow breath at rest, a steady pulse
    // while thinking, a heartbeat while she works a tool, and a throb that
    // follows the words while she talks. Amplitudes ease between phases.
    const p = pulse.current
    const target = PULSE[listening ? 'listening' : phase]
    p.amp += (target.amp - p.amp) * 0.05
    p.glow += (target.glow - p.glow) * 0.05
    const k = reduced ? 0.3 : 1
    let wave: number
    if (phase === 'tool') {
      const q = (s % 1.1) / 1.1 // heartbeat: two quick beats, then rest
      wave = Math.exp(-(((q - 0.08) / 0.06) ** 2)) + 0.65 * Math.exp(-(((q - 0.3) / 0.06) ** 2))
    } else if (phase === 'speaking') {
      wave = Math.min(1, orbSignals.energy * 1.6) * 0.8 + (Math.sin(s * 6) + 1) * 0.1
    } else {
      wave = (Math.sin((s / target.period) * Math.PI * 2) + 1) / 2
    }
    breath.set(1 + wave * p.amp * k * Math.max(0.3, settle.current))
    halo.set(p.glow * (0.6 + 0.4 * wave * k))
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
        {/* Wider and brighter for a strong mood (--mood-glow from MoodLight, cross-fades). */}
        <span
          aria-hidden
          className="absolute inset-[8%]"
          style={{ transform: 'scale(calc(0.85 + var(--mood-glow, 0.45) * 0.35))' }}
        >
          <motion.span
            className="orb-halo absolute inset-0 rounded-full"
            style={{
              opacity: halo,
              background: 'radial-gradient(closest-side, var(--mood-1), transparent)',
              filter: 'blur(24px) brightness(calc(0.8 + var(--mood-glow, 0.45) * 0.5))',
            }}
          />
        </span>
        <Orb />
        <OrbRipple mode={listening ? null : phase === 'tool' ? 'tool' : phase === 'thinking' ? 'thinking' : null} />
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

const PULSE: Record<string, { amp: number; glow: number; period: number }> = {
  offline: { amp: 0, glow: 0.1, period: 6 },
  idle: { amp: 0.025, glow: 0.3, period: 4.5 },
  thinking: { amp: 0.05, glow: 0.6, period: 1.4 },
  tool: { amp: 0.055, glow: 0.7, period: 1.1 },
  speaking: { amp: 0.07, glow: 0.65, period: 1 },
  listening: { amp: 0.04, glow: 0.75, period: 1.2 },
}

/**
 * Ripples of tiny circles spreading out from the orb's edge: slow and soft
 * while she thinks, quicker while she works a tool.
 */
function OrbRipple({ mode }: { mode: 'thinking' | 'tool' | null }) {
  return (
    <AnimatePresence>
      {mode && (
        <motion.span
          key={mode}
          aria-hidden
          className="absolute inset-[2%]"
          style={{ color: mode === 'tool' ? 'var(--role-accent)' : 'var(--mood-2, var(--role-accent))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          <DotRipple
            rings={3}
            dots={mode === 'tool' ? 30 : 24}
            dotR={0.9}
            from={0.62}
            seconds={mode === 'tool' ? 1.4 : 2.6}
            className="h-full w-full"
          />
        </motion.span>
      )}
    </AnimatePresence>
  )
}

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
            style={{ boxShadow: 'inset 0 0 0 2px var(--mood-1, var(--role-accent))' }}
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
  const focus = useUi(panelOpen)
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
