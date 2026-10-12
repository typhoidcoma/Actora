import { AnimatePresence, motion } from 'motion/react'
import { useAgent } from '@actora/stores/agent'
import { DotRipple } from '@actora/ui/DotRipple'
import { useReady } from '../look/ready'

/**
 * Covers the scene until it's whole (look/ready.ts), then fades away and
 * leaves a finished room, the UI making its entrance after. The theme's
 * background and the 2D thinking ripple, so it reads as the app waking up.
 */
export function Loader() {
  const ready = useReady((s) => s.ready)
  const name = useAgent((s) => s.botName)
  return (
    <AnimatePresence>
      {!ready && (
        <motion.div
          key="loader"
          className="fixed inset-0 z-50 grid place-items-center"
          style={{ background: 'var(--t-bg, #13122a)' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeOut' } }}
          aria-busy="true"
          aria-label={`${name} is getting ready`}
        >
          <motion.div
            className="flex flex-col items-center gap-5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.5 } }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.35 } }}
          >
            <DotRipple className="h-16 w-16 text-accent" center />
            <div className="display text-[15px] text-muted">{name} is getting ready…</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
