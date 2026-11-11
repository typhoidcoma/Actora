import { agentName } from '../stores/agent'
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { startGreeting } from '../aelora/greeting'
import { startIdleHome } from './idleHome'
import { useContextKey } from '../options/useOptions'
import { startAgentOptions } from '../options/agentOptions'
import { startRanking } from '../priority/rank'
import { startPush } from '../push/start'
import { useAgent } from '../stores/agent'
import { startLineRelease } from '../stores/lineRelease'
import { useMetrics, watchMetrics } from '../stores/metrics'
import { panelKeyOf, ui, useUi, panelOpen, sideBySide } from '../stores/ui'
import { Ambient } from '../weather/Ambient'
import { ChatSheet } from './ChatSheet'
import { Grid } from './Grid'
import { MenuButton } from './Menu'
import { KeyboardSheet } from './KeyboardSheet'
import { MoodLight } from './MoodLight'
import { OptionRail } from './OptionRail'
import { Toaster } from './Toast'
import { startMoments } from './moments'
import { startCheckins } from '../checkins/checkins'
import { DateSheet } from './DateSheet'
import { SessionChip } from './SessionChip'
import { TypingPeek } from './TypingPeek'
import { PastChats } from './PastChats'
import { OrbDock, OrbSocket } from './OrbDock'
import { startAutoChat } from './autoChat'
import { useThemeSync } from './Theme'
import { AgentLine } from './AgentLine'
import { HomeActions } from './HomeBar'
import { useTypeAnywhere } from './typeAnywhere'

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
  const focus = useUi(panelOpen)
  const chatOpen = useUi((s) => s.chatOpen)
  const fatal = useAgent((s) => s.connection === 'fatal')
  const key = useContextKey()
  const rail = useMetrics((s) => s.rail)
  const compact = useMetrics((s) => s.compact)
  const keyboardUp = useMetrics((s) => s.keyboard)
  const split = useMetrics((s) => s.split)
  const rightRail = useMetrics((s) => s.pair.rightRail)
  const paired = useUi(sideBySide) && split
  const panelKey = useUi(panelKeyOf)
  useThemeSync()
  useTypeAnywhere()

  useEffect(() => watchMetrics(), [])
  useEffect(() => startAgentOptions(), [])
  useEffect(() => startRanking(), [])
  useEffect(() => startAutoChat(), [])
  useEffect(() => startGreeting(), [])
  useEffect(() => startIdleHome(), [])
  useEffect(() => startMoments(), [])
  useEffect(() => startCheckins(), [])
  useEffect(() => startPush(), [])
  // Her line letting go of a reply, a seen welcome, a reminder that's been read (shared with 3D).
  useEffect(() => startLineRelease(), [])
  // The window narrows past room for two: her chat stays, the window beside it closes.
  useEffect(() => {
    if (!split && sideBySide(useUi.getState())) ui.closePanels()
  }, [split])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop grain={false} />
      <MoodLight />
      {focus && <div className="fixed inset-0" onClick={() => (paired ? ui.closeAll() : ui.focus(null))} aria-hidden />}
      <AnimatePresence>
        {/* A phone keyboard up: her line steps aside too (an open panel fills the screen above the keyboard). */}
        {!chatOpen && !keyboardUp && (
          <motion.div key="line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AgentLine />
          </motion.div>
        )}
      </AnimatePresence>
      <LayoutGroup>
        <Grid />
        <OrbSocket />
        <ChatSheet />
        <OrbDock />
      </LayoutGroup>
      <AnimatePresence>
        {/* A phone keyboard up: the pills step aside so what you're typing in gets the room. */}
        {!chatOpen && !keyboardUp && (
          <motion.div
            key="rail"
            // The band from the cards' bottom to the screen edge; the pills sit centred in it,
            // so the space above and below them matches whatever the rows are.
            className="fixed z-30 flex flex-col justify-center gap-2.5"
            style={{ left: rail.x, top: rail.top, bottom: 0, width: rail.w, paddingBottom: rail.padBottom }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            {/* Wide: the pills, then a message box with the mic, chat and menu beside it. */}
            <OptionRail contextKey={key} icons={compact} trailing={<MenuButton onSignOut={onSignOut} />} />
            {!compact && <HomeActions onSignOut={onSignOut} />}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {/* Side by side: the window beside the chat keeps its own pills, in a strip at its foot. */}
        {paired && (
          <motion.div
            key="pair-rail"
            className="fixed z-30 flex flex-col justify-center"
            style={{ left: rightRail.x, top: rightRail.y, width: rightRail.w, height: rightRail.h }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <OptionRail contextKey={panelKey} />
          </motion.div>
        )}
      </AnimatePresence>
      <KeyboardSheet />
      <SessionChip />
      <TypingPeek />
      <PastChats />
      <DateSheet />
      <Toaster />
      <AnimatePresence>{fatal && <FatalCard key="fatal" />}</AnimatePresence>
      {/* Grain sits above the glass, as on a real render, rather than being blurred by it. */}
      <Grain />
    </MotionConfig>
  )
}

function FatalCard() {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ y: 16, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        className="glass glass-thick max-w-sm p-7 text-center"
        style={{ borderRadius: 12 }}
      >
        <div className="display mb-2 text-3xl text-strong">Session ended</div>
        <p className="mb-6 text-sm text-muted">
          The connection to {agentName()} was closed. Reload to start a new session.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-full bg-fill font-medium text-on-accent"
        >
          Reload
        </button>
      </motion.div>
    </motion.div>
  )
}
