import { inkOf } from '../brand'
import { motion, useDragControls, type PanInfo } from 'motion/react'
import type { ReactNode } from 'react'
import { useMetrics } from '../../stores/metrics'
import { morph, press } from '../motion'
import { sheen } from '../sheen'

/**
 * Expanded glass panel that fills the grid. Shares a layoutId with the card it
 * came from, so the card morphs into it; drag the header down or tap × to close.
 * The orb docks in the header's right side (see OrbDock), so keep it clear.
 */
export function Panel({
  layoutId,
  accent,
  kicker,
  title,
  onClose,
  children,
  footer,
  lead = false,
}: {
  layoutId: string
  accent: string
  kicker?: ReactNode
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** The orb docks at the header's left (Wendy's reader): reserve room and enlarge the title. */
  lead?: boolean
}) {
  const radius = useMetrics((s) => s.radius)
  const drag = useDragControls()
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) onClose()
  }

  return (
    <motion.div
      layoutId={layoutId}
      transition={morph}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      drag="y"
      dragListener={false}
      dragControls={drag}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.45 }}
      onDragEnd={onDragEnd}
      {...sheen}
      className="glass glass-thick absolute inset-0 z-10 flex flex-col overflow-hidden"
      style={{ borderRadius: radius + 2 }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${accent} 18%, transparent), transparent 60%)`,
        }}
      />
      <motion.header
        layout="position"
        onPointerDown={(e) => drag.start(e)}
        className={`flex shrink-0 touch-none items-start justify-between gap-4 pt-5 pb-3 ${
          lead ? 'min-h-[92px] pr-[84px] pl-[96px]' : 'pr-[124px] pl-6'
        }`}
      >
        <div className={`min-w-0 ${lead ? 'flex min-h-14 flex-col justify-center' : ''}`}>
          {kicker && (
            <div className="label mb-1" style={{ color: inkOf(accent) }}>
              {kicker}
            </div>
          )}
          <h2
            className={`display leading-[1.02] text-strong ${
              lead
                ? 'text-[clamp(30px,calc(var(--grid)*0.085),46px)] font-bold tracking-[-0.04em]'
                : 'text-[clamp(22px,calc(var(--grid)*0.06),34px)]'
            }`}
          >
            {title}
          </h2>
        </div>
      </motion.header>
      <motion.button
        whileTap={press}
        onClick={onClose}
        aria-label="Close"
        className="glass-pill absolute top-5 right-6 grid h-11 w-11 place-items-center rounded-full text-muted"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
      </motion.button>
      <motion.div
        className="scroll-y min-h-0 flex-1 px-6 pb-6"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0, transition: { ...morph, delay: 0.1 } }}
        exit={{ opacity: 0, transition: { duration: 0.08 } }}
      >
        {children}
      </motion.div>
      {footer && <div className="shrink-0 border-t border-line px-6 py-3">{footer}</div>}
    </motion.div>
  )
}
