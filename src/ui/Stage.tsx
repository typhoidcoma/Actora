import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { markNotificationRead } from '../aelora/client'
import { startGreeting } from '../aelora/greeting'
import { startIdleHome } from './idleHome'
import { useContextKey } from '../options/useOptions'
import { startWendyOptions } from '../options/wendy'
import { startRanking } from '../priority/rank'
import { initPush, setNotificationOpener } from '../push/push'
import { agent, useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { useMetrics, watchMetrics } from '../stores/metrics'
import { contextKeyOf, ui, useUi, panelOpen } from '../stores/ui'
import { Ambient } from '../weather/Ambient'
import { ChatSheet } from './ChatSheet'
import { Grid } from './Grid'
import { MenuButton } from './Menu'
import { KeyboardSheet } from './KeyboardSheet'
import { MoodLight } from './MoodLight'
import { OptionRail } from './OptionRail'
import { Toaster } from './Toast'
import { DateSheet } from './DateSheet'
import { OrbDock, OrbSocket } from './OrbDock'
import { startAutoReader } from './autoReader'
import { useThemeSync } from './Theme'
import { WendyLine } from './WendyLine'

export function Backdrop({ grain = true }: { grain?: boolean }) {
  return (
    <>
      <Ambient />
      {grain && <Grain />}
    </>
  )
}

const Grain = () => <div className="grain z-50" aria-hidden />

/** Lock-screen tap on a reminder: open Inbox on it and mark it read once data is in. */
function openNotification(id: string): void {
  ui.open({ kind: 'notification', id })
  const tryMark = () => {
    const n = useEntities.getState().notifications[id]
    if (!n) return false
    if (!n.read_at) void markNotificationRead(id)
    return true
  }
  if (tryMark()) return
  const off = useEntities.subscribe(() => tryMark() && off())
}

export function Stage({ onSignOut }: { onSignOut?: () => void }) {
  const focus = useUi(panelOpen)
  const chatOpen = useUi((s) => s.chatOpen)
  const fatal = useAgent((s) => s.connection === 'fatal')
  const key = useContextKey()
  const rail = useMetrics((s) => s.rail)
  useThemeSync()

  useEffect(() => watchMetrics(), [])
  useEffect(() => startWendyOptions(), [])
  useEffect(() => startRanking(), [])
  useEffect(() => startAutoReader(), [])
  useEffect(() => startGreeting(), [])
  useEffect(() => startIdleHome(), [])
  useEffect(() => {
    void initPush()
    return setNotificationOpener(openNotification)
  }, [])
  // Moving somewhere new returns Wendy's line from a finished reply to her greeting.
  // A reminder stays until it's acknowledged ("Got it" or read in the inbox).
  useEffect(
    () =>
      useUi.subscribe((s, p) => {
        const a = useAgent.getState()
        const transient = a.line === 'reply' || a.line === 'message'
        if (contextKeyOf(s) !== contextKeyOf(p) && transient && !a.turnId && !a.awaitingTurn) {
          agent.showGreeting()
        }
      }),
    [],
  )
  // …and once it's read anywhere (inbox, "Mark all read", another device), the line lets it go.
  useEffect(
    () =>
      useEntities.subscribe((s) => {
        const a = useAgent.getState()
        if (a.line === 'notice' && a.notice && s.notifications[a.notice.notificationId]?.read_at) agent.showGreeting()
      }),
    [],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop grain={false} />
      <MoodLight />
      {focus && <div className="fixed inset-0" onClick={() => ui.focus(null)} aria-hidden />}
      <AnimatePresence>
        {!chatOpen && (
          <motion.div key="line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WendyLine />
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
        {!chatOpen && (
          <motion.div
            key="rail"
            // The band from the cards' bottom to the screen edge; the pills sit centred in it,
            // so the space above and below them matches whatever the rows are.
            className="fixed z-30 flex flex-col justify-center"
            style={{ left: rail.x, top: rail.top, bottom: 0, width: rail.w, paddingBottom: rail.padBottom }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <OptionRail contextKey={key} trailing={<MenuButton onSignOut={onSignOut} />} />
          </motion.div>
        )}
      </AnimatePresence>
      <KeyboardSheet />
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
        <p className="mb-6 text-sm text-muted">The connection to Wendy was closed. Reload to start a new session.</p>
        <button
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-full bg-accent font-medium text-on-accent"
        >
          Reload
        </button>
      </motion.div>
    </motion.div>
  )
}
