import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { useAgent } from '../stores/agent'
import { watchMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { ChatSheet } from './ChatSheet'
import { Grid } from './Grid'
import { Ambient } from '../weather/Ambient'
import { Header } from './Header'
import { MoodLight } from './MoodLight'
import { OrbDock, OrbSocket } from './OrbDock'

export function Backdrop({ grain = true }: { grain?: boolean }) {
  return (
    <>
      <Ambient />
      {grain && <Grain />}
    </>
  )
}

const Grain = () => <div className="grain z-50" aria-hidden />

export function Stage({ onSignOut }: { onSignOut?: () => void }) {
  const focus = useUi((s) => s.focus)
  const fatal = useAgent((s) => s.connection === 'fatal')

  useEffect(() => watchMetrics(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop grain={false} />
      <MoodLight />
      <Header onSignOut={onSignOut} />
      {focus && <div className="fixed inset-0" onClick={() => ui.focus(null)} aria-hidden />}
      <LayoutGroup>
        <Grid />
        <OrbSocket />
        <ChatSheet />
        <OrbDock />
      </LayoutGroup>
      <AnimatePresence>{fatal && <FatalCard key="fatal" />}</AnimatePresence>
      {/* Grain sits above the glass, as on a real render, rather than being blurred by it. */}
      <Grain />
    </MotionConfig>
  )
}

function FatalCard() {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ y: 16, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        className="glass max-w-sm p-7 text-center"
        style={{ borderRadius: 28 }}
      >
        <div className="mb-2 text-lg font-medium text-white">Session ended</div>
        <p className="mb-6 text-sm text-muted">The connection to Wendy was closed. Reload to start a new session.</p>
        <button
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-full bg-lime font-medium text-ink"
        >
          Reload
        </button>
      </motion.div>
    </motion.div>
  )
}
