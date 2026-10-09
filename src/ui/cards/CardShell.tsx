import { motion } from 'motion/react'
import type { KeyboardEvent, ReactNode } from 'react'
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
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
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
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ ...morph, scale: jelly.transition }}
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
