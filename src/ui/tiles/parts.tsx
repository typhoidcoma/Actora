import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useAgent } from '../../stores/agent'

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <header className="mb-1 flex items-baseline justify-between">
        <h3 className="label">{title}</h3>
        {count !== undefined && <span className="num text-xs text-faint">{count}</span>}
      </header>
      <ul>{children}</ul>
    </section>
  )
}

/**
 * Before a list has arrived: placeholder rows, never "All clear" (it isn't known
 * yet). Offline, it says it can't load rather than shimmering forever.
 */
export function Loading() {
  const offline = useAgent((s) => s.connection !== 'open' && s.connection !== 'connecting')
  if (offline) return <Empty text="Can't load this right now. It'll fill in once Wendy's back." />
  return (
    <div className="space-y-3 py-4" aria-label="Loading">
      {[0.92, 0.7, 0.82, 0.6].map((w, i) => (
        <div key={i} className="shimmer h-11 rounded-[6px] bg-text/6" style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="display py-10 text-center text-2xl text-muted">{text}</p>
}

/**
 * Highlight behind a selected row; its actions live on the option rail, so the
 * row itself only needs to say "this one".
 */
export function SelectedWash({ on, accent }: { on: boolean; accent: string }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.span
          aria-hidden
          layoutId="row-wash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="pointer-events-none absolute -inset-x-3 inset-y-0 -z-10 rounded-[8px]"
          style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
        />
      )}
    </AnimatePresence>
  )
}
