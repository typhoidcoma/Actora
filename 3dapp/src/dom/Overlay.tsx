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
import { jelly } from '@actora/ui/motion'
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
 * What's DOM. At home: the chat and menu buttons riding the end of the chip
 * row. In focus: the 2D app's own panel for whatever is open, portalled into
 * the element the scene stands up as the focus panel (FocusPanel3D), with its
 * options in a strip at its foot. And the screen-level sheets (keyboard, past
 * chats, date picker, toasts).
 */
export function Overlay() {
  const focused = useFocused()
  const host = useFocusHost()
  useHostMetrics(host.w, host.h, window.innerWidth / window.innerHeight < 0.8)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        {/* Home: chat and menu at the end of the chip row (positioned by the scene's Anchor). */}
        <motion.div
          ref={anchorRef('rail-end')}
          className="fixed top-0 left-0 z-30 flex items-center gap-1.5"
          animate={{ opacity: focused ? 0 : 1 }}
          transition={{ delay: focused ? 0 : 0.5, duration: 0.25 }}
          style={{ pointerEvents: focused ? 'none' : 'auto' }}
        >
          <motion.button
            whileTap={jelly}
            onClick={ui.openChat}
            aria-label="Open the conversation"
            className="glass-pill grid h-10 w-10 place-items-center rounded-[8px] text-muted"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
              <path
                d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h0a2 2 0 0 1-2-2z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </motion.button>
          <MenuButton onSignOut={onSignOut} />
        </motion.div>
        {host.el && createPortal(<FocusContent focused={focused} />, host.el)}
      </LayoutGroup>
      <KeyboardSheet />
      <PastChats />
      <DateSheet />
      <Toaster />
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
        <div className="absolute flex items-center overflow-hidden" style={{ left: m.rail.x, top: m.rail.y + 8, width: m.rail.w, height: m.rail.h - 8 }}>
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
