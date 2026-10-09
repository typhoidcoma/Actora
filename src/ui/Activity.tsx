import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useShallow } from 'zustand/react/shallow'
import { thinkingWords, type StepIcon } from '../aelora/activity'
import { useAgent } from '../stores/agent'
import { useNow } from './tiles/data'

/**
 * What Wendy is doing right now, narrated: the current step large with a
 * shimmer and its detail ("best ramen near me", "theverge.com"), and the
 * steps she's finished trailing beneath as small ticks. With no tool running
 * it reads "Thinking", then "Thinking it through"… as time passes.
 */
export function Activity({ compact = false }: { compact?: boolean }) {
  const a = useAgent(useShallow((s) => ({ steps: s.steps, phase: s.phase, turnAt: s.turnAt })))
  const now = useNow(1000)
  const current = a.steps.findLast((x) => x.status === 'running')
  const finished = a.steps.filter((x) => x.status !== 'running').slice(-4)
  const label = current?.doing ?? thinkingWords(a.turnAt ? now - a.turnAt : 0)
  const icon: StepIcon = current?.icon ?? 'think'

  return (
    <span className="inline-flex max-w-full flex-col items-center gap-1.5 align-middle" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={current?.id ?? label}
          className="inline-flex max-w-full items-center gap-3"
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.18 } }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <ActivityIcon icon={icon} size={compact ? 18 : 24} />
          <span className="text-sweep truncate">{label}</span>
        </motion.span>
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {current?.detail && (
          <motion.span
            key={`d-${current.id}`}
            className="max-w-full truncate font-sans text-[max(14px,0.6em)] text-muted"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            “{current.detail}”
          </motion.span>
        )}
      </AnimatePresence>
      {!compact && finished.length > 0 && (
        <motion.span layout className="flex max-w-full flex-wrap justify-center gap-x-4 gap-y-1 font-sans">
          <AnimatePresence initial={false}>
            {finished.map((x) => (
              <motion.span
                key={x.id}
                layout
                className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${x.status === 'failed' ? 'text-faint line-through' : 'text-muted'}`}
                initial={{ opacity: 0, x: -8, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <Tick failed={x.status === 'failed'} />
                {x.done}
              </motion.span>
            ))}
          </AnimatePresence>
        </motion.span>
      )}
    </span>
  )
}

function Tick({ failed }: { failed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <motion.path
        d={failed ? 'M4 4l8 8M12 4l-8 8' : 'M3.5 8.5l3 3 6-7'}
        fill="none"
        stroke={failed ? 'var(--t-faint)' : 'var(--ink-calm)'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </svg>
  )
}

/** Line icons (24px grid), each with its own small loop of motion. */
const PATHS: Record<StepIcon, string> = {
  think: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  read: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  memory: 'M12 4a8 8 0 1 0 8 8M12 8v4l3 2M20 4v4h-4',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  task: 'M5 12.5l4.5 4.5L19 7',
  goal: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  note: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1 1 0 1 0 0 .01',
  weather:
    'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  screen: 'M3 5h18v12H3zM8 21h8M12 17v4',
  tool: 'M14 6a4 4 0 0 0-5 5l-5 5 3 3 5-5a4 4 0 0 0 5-5l-2.5 2.5-2-.5-.5-2z',
}

function ActivityIcon({ icon, size }: { icon: StepIcon; size: number }) {
  const reduced = useReducedMotion()
  const loop = reduced
    ? {}
    : icon === 'search'
      ? { x: [0, 2, 0, -2, 0], y: [0, -2, -3, -2, 0] }
      : icon === 'think' || icon === 'weather'
        ? { rotate: [0, 90, 180], scale: [1, 1.15, 1] }
        : icon === 'read'
          ? { y: [0, -2, 0] }
          : icon === 'memory'
            ? { rotate: [0, -20, 0] }
            : { scale: [1, 1.12, 1] }
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0 text-accent"
      aria-hidden
      animate={loop}
      transition={{ duration: icon === 'think' ? 2.4 : 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path
        d={PATHS[icon]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </motion.svg>
  )
}
