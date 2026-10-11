import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
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
import { focusLayout } from '../look/layout'
import { anchorRef } from '../scene/Anchor'
import { FOCUS_RADIUS } from '../scene/FocusSlab'

const LISTS: Record<TileId, { label: string; accent: string; Detail: () => React.ReactNode }> = {
  tasks: { label: 'Tasks', accent: TASKS_ACCENT, Detail: TasksDetail },
  calendar: { label: 'Calendar', accent: CALENDAR_ACCENT, Detail: CalendarDetail },
  goals: { label: 'Goals', accent: GOALS_ACCENT, Detail: GoalsDetail },
  inbox: { label: 'Inbox', accent: INBOX_ACCENT, Detail: InboxDetail },
}

/** Height kept under an open panel for its options (the 2D rail). */
const RAIL = 60
const onSignOut = config.mock ? undefined : () => void signOut()

/**
 * The 2D app's metrics, re-pointed at the 3D focus panel: its components lay
 * themselves out from `useMetrics` (the chat sheet, the panel box, the rail), so
 * telling them the panel's screen box makes them land exactly on the slab.
 */
function useFocusMetrics() {
  useEffect(() => {
    const apply = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const f = focusLayout(vw / vh)
      const x = Math.round(f.rect.x0 * vw)
      const y = Math.round(f.rect.y0 * vh)
      const w = Math.round((f.rect.x1 - f.rect.x0) * vw)
      const h = Math.round((f.rect.y1 - f.rect.y0) * vh)
      const grid = Math.min(w, h)
      useMetrics.setState({
        vw,
        vh,
        grid,
        compact: f.portrait,
        stack: false,
        short: false,
        radius: FOCUS_RADIUS - 1,
        sheet: { x, y, w, h, radius: FOCUS_RADIUS, inset: 0 },
        panel: { x, y, w, h: h - RAIL },
        rail: { x, y: y + h - RAIL, w, h: RAIL, padBottom: 0, top: y + h - RAIL },
        panelInset: 0,
      })
      const s = document.documentElement.style
      s.setProperty('--grid', `${grid}px`)
      s.setProperty('--radius', `${FOCUS_RADIUS - 1}px`)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])
}

/**
 * What stays DOM: the 2D app's own panels, chat, menu and sheets, laid over the
 * scene. At home that's just the chat and menu buttons riding the end of the
 * chip row; in focus mode it's whatever is open, on the slab, with its options
 * under it. They fade in once the slab has landed and out as it leaves.
 */
export function Overlay() {
  useFocusMetrics()
  const focused = useFocused()
  const m = useMetrics()
  const key = useContextKey()
  const chatOpen = useUi((s) => s.chatOpen)
  const focus = useUi((s) => s.focus)
  const selected = useUi((s) => s.selected)
  const finds = useUi((s) => s.finds)
  const vault = useUi((s) => s.vault)
  const item = !focus && selected ? selected : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // In once the slab has landed (its flight is ~0.55 s), out at once as it leaves.
  const land = { opacity: focused ? 1 : 0, transition: { delay: focused ? 0.55 : 0, duration: focused ? 0.28 : 0.1 } }

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

        {/* Focus: the open panel on the slab, its options beneath. */}
        <motion.div className="pointer-events-none fixed inset-0 z-20" initial={false} animate={land}>
          <div className="absolute" style={{ left: m.panel.x, top: m.panel.y, width: m.panel.w, height: m.panel.h }}>
            <AnimatePresence>
              {focus && <ListPanel key={`list-${focus}`} id={focus} />}
              {item && <ItemPanel key={`item-${item.kind}:${item.id}`} item={item} />}
              {finds && <FindsPanel key="finds" />}
              {vault && <VaultPanel key="vault" />}
            </AnimatePresence>
          </div>
          {focused && !chatOpen && (
            <div className="pointer-events-auto absolute flex items-center" style={{ left: m.rail.x, top: m.rail.y, width: m.rail.w, height: m.rail.h }}>
              <OptionRail contextKey={key} trailing={<MenuButton onSignOut={onSignOut} />} />
            </div>
          )}
          <div className="pointer-events-auto">
            <ChatSheet />
          </div>
        </motion.div>
      </LayoutGroup>
      <KeyboardSheet />
      <PastChats />
      <DateSheet />
      <Toaster />
    </MotionConfig>
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
