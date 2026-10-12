import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { signOut } from '@actora/auth/supabase'
import { config } from '@actora/config'
import { useContextKey } from '@actora/options/useOptions'
import { useMetrics } from '@actora/stores/metrics'
import { ui, useUi, type TileId } from '@actora/stores/ui'
import { ItemPanel } from '@actora/ui/cards/ItemPanel'
import { FindsPanel } from '@actora/ui/cards/FindsPanel'
import { Panel } from '@actora/ui/cards/Panel'
import { VaultPanel } from '@actora/ui/cards/VaultPanel'
import { ChatSheet } from '@actora/ui/ChatSheet'
import { DateSheet } from '@actora/ui/DateSheet'
import { KeyboardSheet } from '@actora/ui/KeyboardSheet'
import { MenuButton } from '@actora/ui/Menu'
import { say } from '@actora/options/run'
import { agentName } from '@actora/stores/agent'
import { OptionRail } from '@actora/ui/OptionRail'
import { PastChats } from '@actora/ui/PastChats'
import { Toaster } from '@actora/ui/Toast'
import { CALENDAR_ACCENT, CalendarDetail } from '@actora/ui/tiles/Calendar'
import { GOALS_ACCENT, GoalsDetail } from '@actora/ui/tiles/Goals'
import { INBOX_ACCENT, InboxDetail } from '@actora/ui/tiles/Inbox'
import { TASKS_ACCENT, TasksDetail } from '@actora/ui/tiles/Tasks'
import { useFocused } from '../look/focus'
import { FOCUS_RADIUS, FOCUS_RAIL, useFocusHost } from '../look/focusHost'
import { anchorRef } from '../scene/Anchor'
import { useDraft } from '../scene/draft'
import { useReady } from '../look/ready'
import { Loader } from './Loader'
import { Activity } from '@actora/ui/Activity'
import { useAgent } from '@actora/stores/agent'

const LISTS: Record<TileId, { label: string; accent: string; Detail: () => React.ReactNode }> = {
  tasks: { label: 'Tasks', accent: TASKS_ACCENT, Detail: TasksDetail },
  calendar: { label: 'Calendar', accent: CALENDAR_ACCENT, Detail: CalendarDetail },
  goals: { label: 'Goals', accent: GOALS_ACCENT, Detail: GoalsDetail },
  inbox: { label: 'Inbox', accent: INBOX_ACCENT, Detail: InboxDetail },
}

const onSignOut = config.mock ? undefined : () => void signOut()

/**
 * The 2D app's metrics, re-pointed at the focus panel's host element. That
 * element is transformed into the scene (CSS3D), so it is the containing block
 * even for the chat sheet's `position: fixed`: its box starts at 0,0.
 */
function useHostMetrics(w: number, h: number, portrait: boolean) {
  useEffect(() => {
    if (!w || !h) return
    const grid = Math.min(w, h)
    useMetrics.setState({
      vw: window.innerWidth,
      vh: window.innerHeight,
      grid,
      compact: portrait,
      stack: false,
      short: false,
      radius: FOCUS_RADIUS - 1,
      sheet: { x: 0, y: 0, w, h, radius: FOCUS_RADIUS, inset: 0 },
      panel: { x: 0, y: 0, w, h: h - FOCUS_RAIL },
      rail: { x: 0, y: h - FOCUS_RAIL, w, h: FOCUS_RAIL, padBottom: 0, top: h - FOCUS_RAIL },
      panelInset: 0,
    })
    const s = document.documentElement.style
    s.setProperty('--grid', `${grid}px`)
    s.setProperty('--radius', `${FOCUS_RADIUS - 1}px`)
  }, [w, h, portrait])
}

/**
 * What's DOM. At home: the 2D rail (option pills, chat, menu) and the message
 * box, pinned in the room by an Anchor, and her thinking (Activity) over her head.
 * In focus: the 2D app's own panel for whatever is open, portalled into
 * the element the scene stands up as the focus panel (FocusPanel3D), with its
 * options in a strip at its foot. And the screen-level sheets (keyboard, past
 * chats, date picker, toasts).
 */
export function Overlay() {
  const focused = useFocused()
  const ready = useReady((s) => s.ready)
  const host = useFocusHost()
  const phone = window.innerWidth / window.innerHeight < 0.8
  const key = useContextKey()
  useHostMetrics(host.w, host.h, phone)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        {/* Home: the 2D rail (glass option pills, chat, keyboard, menu), pinned in the room by the scene's Anchor. */}
        <motion.div
          ref={anchorRef('rail')}
          className="fixed top-0 left-0 z-30 flex flex-col items-stretch gap-2.5"
          style={{ width: railWidth(), pointerEvents: focused || !ready ? 'none' : 'auto' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: focused || !ready ? 0 : 1, y: ready ? 0 : 10 }}
          transition={{ delay: focused ? 0 : 0.6, duration: 0.4 }}
        >
          <OptionRail contextKey={key} trailing={<MenuButton onSignOut={onSignOut} />} />
          {!phone && <MessageBox />}
        </motion.div>
        <Thinking hidden={focused || !ready} />
        {host.el && createPortal(<FocusContent focused={focused} />, host.el)}
      </LayoutGroup>
      <KeyboardSheet />
      <PastChats />
      <DateSheet />
      <Toaster />
      <Loader />
    </MotionConfig>
  )
}

/** The open thing, filling the in-scene panel; its options below it, never cut off. */
function FocusContent({ focused }: { focused: boolean }) {
  const m = useMetrics()
  const key = useContextKey()
  const chatOpen = useUi((s) => s.chatOpen)
  const focus = useUi((s) => s.focus)
  const selected = useUi((s) => s.selected)
  const finds = useUi((s) => s.finds)
  const vault = useUi((s) => s.vault)
  const item = !focus && selected ? selected : null

  return (
    <>
      <div className="absolute" style={{ left: m.panel.x, top: m.panel.y, width: m.panel.w, height: m.panel.h }}>
        <AnimatePresence>
          {focus && <ListPanel key={`list-${focus}`} id={focus} />}
          {item && <ItemPanel key={`item-${item.kind}:${item.id}`} item={item} />}
          {finds && <FindsPanel key="finds" />}
          {vault && <VaultPanel key="vault" />}
        </AnimatePresence>
      </div>
      {focused && !chatOpen && (
        <div className="absolute flex items-center" style={{ left: m.rail.x, top: m.rail.y + 6, width: m.rail.w, height: m.rail.h - 6 }}>
          <OptionRail contextKey={key} trailing={<MenuButton onSignOut={onSignOut} />} />
        </div>
      )}
      <ChatSheet />
    </>
  )
}

function ListPanel({ id }: { id: TileId }) {
  const { Detail, accent, label } = LISTS[id]
  return (
    <Panel layoutId={`list-${id}`} accent={accent} title={label} onClose={() => ui.focus(null)}>
      <Detail />
    </Panel>
  )
}

/** The home rail's width: the 2D rail's, or the phone's width less its margins. */
function railWidth(): number {
  const vw = window.innerWidth
  return vw / window.innerHeight < 0.8 ? vw - 24 : Math.min(vw - 48, 980)
}

/** The message box under the rail (wide screens): the 2D glass, Enter sends. */
function MessageBox() {
  const text = useDraft((s) => s.text)
  return (
    <input
      value={text}
      onChange={(e) => useDraft.setState({ text: e.target.value })}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !text.trim()) return
        if (say(text.trim())) useDraft.setState({ text: '' })
      }}
      placeholder={`Say something to ${agentName()}`}
      aria-label="Message"
      className="glass-pill mx-auto h-11 w-full max-w-[640px] rounded-full px-5 text-[15px] text-strong outline-none placeholder:text-muted"
    />
  )
}

/**
 * Her thinking over her head at home: the 2D app's own animated Activity (step
 * icon, sweeping "Looking at your calendar…" label, the steps she's done),
 * shown while a turn is under way and nothing has streamed yet.
 */
function Thinking({ hidden }: { hidden: boolean }) {
  const show = useAgent((s) => (s.awaitingTurn || s.turnId !== null) && !s.streaming && s.line === 'reply')
  return (
    <div ref={anchorRef('thinking')} className="pointer-events-none fixed top-0 left-0 z-20" style={{ paddingBottom: 6 }}>
      <AnimatePresence>
        {show && !hidden && (
          <motion.div
            key="thinking"
            className="display text-center text-[clamp(16px,1.6vw,22px)] whitespace-nowrap text-strong"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <Activity />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
