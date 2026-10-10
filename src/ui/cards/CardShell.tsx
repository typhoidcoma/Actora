import { motion } from 'motion/react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useMetrics } from '../../stores/metrics'
import { jelly, morph } from '../motion'
import { sheen } from '../sheen'
import type { Corner } from '../tiles/Face'
import { GLOW_AT, NOTCH } from './kinds'

/**
 * The glass body every grid card shares: 4:3 cell, notch toward the orb, soft
 * accent glow from its outer corner, jelly press, and a layoutId so it can
 * morph into its expanded panel. It is a div with role=button (not a <button>)
 * so cards may contain links and their own buttons.
 */
export function CardShell({
  layoutId,
  corner,
  accent,
  hidden,
  label,
  onOpen,
  children,
}: {
  layoutId: string
  corner: Corner
  accent: string
  hidden: boolean
  label: string
  onOpen: () => void
  children: ReactNode
}) {
  const radius = useMetrics((s) => s.radius)
  const onKey = (e: KeyboardEvent) => {
    // Only the card itself: Enter on its quick action belongs to that button.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
  const intro = useIntro()
  return (
    <motion.div
      layout
      layoutId={layoutId}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={onKey}
      whileTap={jelly}
      {...sheen}
      // First paint only: the four boxes rise in one after another (panel morphs skip it).
      initial={intro ? { opacity: 0, y: 22, scale: 0.95 } : false}
      animate={{ opacity: hidden ? 0 : 1, y: 0, scale: 1 }}
      transition={{
        ...morph,
        scale: jelly.transition,
        ...(intro ? { delay: 0.15 + corner * 0.07, type: 'spring', stiffness: 220, damping: 24 } : {}),
      }}
      className={`glass ${NOTCH[corner]} relative cursor-pointer overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50`}
      style={{ borderRadius: radius }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 120% at ${GLOW_AT[corner]}, color-mix(in srgb, ${accent} 24%, transparent), transparent 62%)`,
        }}
      />
      <motion.div layout="position" className="h-full w-full">
        {children}
      </motion.div>
    </motion.div>
  )
}

let introOver = false
/** True only while the app's first paint is playing (the first ~1.5 s). */
function useIntro(): boolean {
  const [on] = useState(() => !introOver)
  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => (introOver = true), 1500)
    return () => clearTimeout(t)
  }, [on])
  return on
}
