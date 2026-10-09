import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

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
