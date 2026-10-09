import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useAgent } from '../stores/agent'
import { panelOpen, useUi } from '../stores/ui'
import { useMetrics } from '../stores/metrics'
import { toast, useToast } from '../stores/toast'
import { press } from './motion'

/**
 * On phones an open panel hides Wendy's line, which is where app notes and a
 * lost connection are said. While that's the case, say them here instead.
 */
function usePhoneNotes() {
  useEffect(() => {
    let lostTimer: ReturnType<typeof setTimeout> | undefined
    const hidden = () => useMetrics.getState().stack && panelOpen(useUi.getState())
    const off = useAgent.subscribe((s, p) => {
      if (s.line === 'message' && s.message && s.message !== p.message && hidden()) toast.show(s.message, { ms: 6000 })
      if (s.connection !== p.connection) {
        clearTimeout(lostTimer)
        if (s.connection !== 'open' && s.connection !== 'idle') {
          lostTimer = setTimeout(() => {
            if (hidden() && useAgent.getState().connection !== 'open')
              toast.error(
                useAgent.getState().connection === 'fatal'
                  ? "Can't reach Wendy. Reload to try again."
                  : "Can't reach Wendy yet. Still trying…",
                { ms: 8000 },
              )
          }, 4000)
        }
      }
    })
    return () => {
      off()
      clearTimeout(lostTimer)
    }
  }, [])
}

/** The feedback bar: sits just above the option rail, centred, on every screen. */
export function Toaster() {
  usePhoneNotes()
  const t = useToast((s) => s.toast)
  const rail = useMetrics((m) => m.rail)
  const w = Math.min(rail.w - 16, 460)

  return (
    <div
      className="pointer-events-none fixed z-40 flex justify-center"
      style={{ left: rail.x, width: rail.w, bottom: window.innerHeight - rail.y + 8 }}
      aria-live="polite"
    >
      <AnimatePresence>
        {t && (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="glass glass-thick pointer-events-auto flex min-h-11 items-center gap-3 rounded-[8px] py-1.5 pr-1.5 pl-4"
            style={{ maxWidth: w }}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: t.tone === 'error' ? 'var(--color-urgent)' : 'var(--color-accent)' }}
            />
            <span className="min-w-0 flex-1 text-[14px] leading-snug text-strong">{t.text}</span>
            {(t.undo || t.action) && (
              <motion.button
                whileTap={press}
                onClick={() => {
                  if (t.undo) t.undo()
                  else t.action?.run()
                  toast.dismiss(t.id)
                }}
                className="glass-pill h-9 shrink-0 rounded-[6px] px-3.5 text-[14px] font-semibold text-accent"
              >
                {t.undo ? 'Undo' : t.action?.label}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
