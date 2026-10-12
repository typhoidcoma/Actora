import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { signOut } from '@actora/auth/supabase'
import { config } from '@actora/config'
import { useContextKey } from '@actora/options/useOptions'
import { useMetrics } from '@actora/stores/metrics'
import { ui, useUi, type TileId } from '@actora/stores/ui'
import { Panel } from '@actora/ui/cards/Panel'
import { ChatSheet } from '@actora/ui/ChatSheet'
import { MenuButton } from '@actora/ui/Menu'
import { say, toggleVoice } from '@actora/options/run'
import { useOptionsStore } from '@actora/stores/options'
import { jelly } from '@actora/ui/motion'
import { agentName } from '@actora/stores/agent'
import { OptionRail } from '@actora/ui/OptionRail'
import { Toaster } from '@actora/ui/Toast'
import { ROLE } from '@actora/ui/brand'
import { useFocused } from '../look/focus'
import { FOCUS_RADIUS, FOCUS_RAIL, useFocusHost } from '../look/focusHost'
import { anchorRef } from '../scene/Anchor'
import { useDraft } from '../look/draft'
import { useReady } from '../look/ready'
import { useCaption } from '../look/caption'
import { Loader } from './Loader'
import { Activity } from '@actora/ui/Activity'
import { useAgent } from '@actora/stores/agent'

// Panels shown only once something is opened: their own chunks, fetched on idle
// after the scene is revealed (prefetchPanels), so opening one is still instant.
const panels = {
  item: () => import('@actora/ui/cards/ItemPanel'),
  finds: () => import('@actora/ui/cards/FindsPanel'),
  vault: () => import('@actora/ui/cards/VaultPanel'),
  calendar: () => import('@actora/ui/tiles/Calendar'),
  goals: () => import('@actora/ui/tiles/Goals'),
  inbox: () => import('@actora/ui/tiles/Inbox'),
  tasks: () => import('@actora/ui/tiles/Tasks'),
  date: () => import('@actora/ui/DateSheet'),
  keyboard: () => import('@actora/ui/KeyboardSheet'),
  past: () => import('@actora/ui/PastChats'),
}
const ItemPanel = lazy(() => panels.item().then((m) => ({ default: m.ItemPanel })))
const FindsPanel = lazy(() => panels.finds().then((m) => ({ default: m.FindsPanel })))
const VaultPanel = lazy(() => panels.vault().then((m) => ({ default: m.VaultPanel })))
const DateSheet = lazy(() => panels.date().then((m) => ({ default: m.DateSheet })))
const KeyboardSheet = lazy(() => panels.keyboard().then((m) => ({ default: m.KeyboardSheet })))
const PastChats = lazy(() => panels.past().then((m) => ({ default: m.PastChats })))
function prefetchPanels(): void {
  const go = () => Object.values(panels).forEach((load) => void load().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}

const LISTS: Record<TileId, { label: string; accent: string; Detail: React.LazyExoticComponent<() => React.ReactNode> }> = {
  tasks: { label: 'Tasks', accent: ROLE.kind.task, Detail: lazy(() => panels.tasks().then((m) => ({ default: m.TasksDetail }))) },
  calendar: { label: 'Calendar', accent: ROLE.kind.event, Detail: lazy(() => panels.calendar().then((m) => ({ default: m.CalendarDetail }))) },
  goals: { label: 'Goals', accent: ROLE.kind.goal, Detail: lazy(() => panels.goals().then((m) => ({ default: m.GoalsDetail }))) },
  inbox: { label: 'Inbox', accent: ROLE.kind.notification, Detail: lazy(() => panels.inbox().then((m) => ({ default: m.InboxDetail }))) },
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
  const sheets = useSheetsWanted()
  useEffect(() => {
    if (ready) prefetchPanels()
  }, [ready])
  const host = useFocusHost()
  const phone = window.innerWidth / window.innerHeight < 0.8
  const key = useContextKey()
  useHostMetrics(host.w, host.h, phone)

  // Typing goes straight to the message box: a printable key pressed with nothing
  // to type into focuses the box for where they are (the chat's composer when it's
  // open, else the home box) and the keystroke lands there, first letter included.
  useEffect(() => {
    const onType = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const at = document.activeElement as HTMLElement | null
      if (at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return
      const box = useUi.getState().chatOpen
        ? document.querySelector<HTMLElement>('[role="dialog"] textarea, [role="dialog"] input')
        : document.querySelector<HTMLElement>('input[aria-label="Message"]')
      if (box && box.offsetParent !== null) box.focus()
    }
    window.addEventListener('keydown', onType)
    return () => window.removeEventListener('keydown', onType)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.closeAll()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        {/* Home: the 2D rail (glass option pills, chat, keyboard, menu), pinned in the room by the scene's Anchor. */}
        {/* Pinned (the scene writes the outer element's transform every frame) and faded
            (motion animates the inner one): two elements, so the fade's own transform
            can never replace the pin and fling the rail to the top-left corner. */}
        <div
          ref={anchorRef('rail')}
          className="fixed top-0 left-0 z-30"
          style={{ width: railWidth(), pointerEvents: focused || !ready ? 'none' : 'auto' }}
        >
        <motion.div
          className="flex flex-col items-stretch gap-2.5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: focused || !ready ? 0 : 1, y: ready ? 0 : 10 }}
          transition={{ delay: focused ? 0 : 0.6, duration: 0.4 }}
        >
          {/* Wide: the rail is just its pills; chat, mic and menu sit beside the message box. */}
          <div className={phone ? '' : 'home-rail'}>
            <OptionRail contextKey={key} trailing={<MenuButton onSignOut={onSignOut} />} />
          </div>
          {!phone && (
            <div className="home-actions mx-auto flex w-full max-w-[780px] items-center gap-2">
              <MessageBox />
              <MicButton />
              <motion.button
                whileTap={jelly}
                onClick={ui.openChat}
                aria-label="Open the conversation"
                className="glass-pill grid h-11 w-11 shrink-0 place-items-center rounded-[8px] text-muted"
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
            </div>
          )}
        </motion.div>
        </div>
        <Thinking hidden={focused || !ready} />
        <FocusCaption />
        {host.el && createPortal(<FocusContent focused={focused} />, host.el)}
      </LayoutGroup>
      <Suspense fallback={null}>
        {sheets.keyboard && <KeyboardSheet />}
        {sheets.past && <PastChats />}
        {sheets.date && <DateSheet />}
      </Suspense>
      <Toaster />
      <Loader />
    </MotionConfig>
  )
}

/** The open thing, filling the in-scene panel; its options below it, never cut off. */
function FocusContent({ focused }: { focused: boolean }) {
  const m = useMetrics(useShallow((s) => ({ panel: s.panel, rail: s.rail })))
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
          {focus && (
            <Suspense key={`list-${focus}`} fallback={null}>
              <ListPanel id={focus} />
            </Suspense>
          )}
          {item && (
            <Suspense key={`item-${item.kind}:${item.id}`} fallback={null}>
              <ItemPanel item={item} />
            </Suspense>
          )}
          {finds && (
            <Suspense key="finds" fallback={null}>
              <FindsPanel />
            </Suspense>
          )}
          {vault && (
            <Suspense key="vault" fallback={null}>
              <VaultPanel />
            </Suspense>
          )}
        </AnimatePresence>
      </div>
      {focused && !chatOpen && (
        <div
          className="absolute flex items-center border-t border-line px-5 pb-1"
          style={{ left: m.rail.x, top: m.rail.y, width: m.rail.w, height: m.rail.h }}
        >
          <OptionRail className="w-full" contextKey={key} trailing={<MenuButton onSignOut={onSignOut} />} />
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
      className="glass-pill h-11 min-w-0 flex-1 rounded-full px-5 text-[15px] text-strong outline-none placeholder:text-muted"
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
    <div
      ref={anchorRef('thinking')}
      className="pointer-events-none fixed top-0 left-0 z-20"
      style={{ paddingBottom: 6 }}
    >
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

/** Speech to text: tap to talk, tap again to stop; what she hears is sent as a turn (the rail shows it live). */
function MicButton() {
  const listening = useOptionsStore((s) => s.listening)
  return (
    <motion.button
      whileTap={jelly}
      onClick={toggleVoice}
      aria-label={listening ? 'Stop listening' : 'Talk'}
      aria-pressed={listening}
      className={`glass-pill grid h-11 w-11 shrink-0 place-items-center rounded-[8px] ${listening ? 'text-urgent' : 'text-muted'}`}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        aria-hidden
        animate={listening ? { scale: [1, 1.15, 1], opacity: [1, 0.65, 1] } : { scale: 1, opacity: 1 }}
        transition={listening ? { duration: 1.1, repeat: Infinity } : { duration: 0.2 }}
      >
        <rect
          x="9"
          y="3"
          width="6"
          height="11"
          rx="3"
          fill={listening ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </motion.svg>
    </motion.button>
  )
}

/**
 * Her words while a card, list or finds is open (the chat shows them itself): a
 * caption in the free space by her head, left of the panel (on phones, the strip
 * above her). Plain text, so the close-up's depth of field can't blur it.
 */
function FocusCaption() {
  const focused = useFocused()
  const chatOpen = useUi((s) => s.chatOpen)
  const { text, color, present } = useCaption()
  const phone = window.innerWidth / window.innerHeight < 0.8
  const show = focused && !chatOpen && present
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="focus-caption"
          className="display pointer-events-none fixed z-20 leading-snug font-semibold"
          style={{
            left: phone ? '5%' : '3%',
            top: phone ? '3%' : '6%',
            width: phone ? '90%' : '38%',
            fontSize: phone ? 15 : 19,
            color,
            textShadow: '0 1px 12px color-mix(in srgb, var(--t-bg) 70%, transparent)',
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.35 } }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Which of the screen-level sheets have been wanted yet: each mounts on first use and stays. */
function useSheetsWanted(): { keyboard: boolean; past: boolean; date: boolean } {
  const now = useUi(useShallow((s) => ({ keyboard: s.keyboardOpen, past: s.pastChats, date: s.picking !== null })))
  const [seen, setSeen] = useState(now)
  if ((now.keyboard && !seen.keyboard) || (now.past && !seen.past) || (now.date && !seen.date))
    setSeen({ keyboard: seen.keyboard || now.keyboard, past: seen.past || now.past, date: seen.date || now.date })
  return seen
}
