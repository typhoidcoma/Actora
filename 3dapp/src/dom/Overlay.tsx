import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { signOut } from '@actora/auth/supabase'
import { config } from '@actora/config'
import { useContextKey } from '@actora/options/useOptions'
import { useMetrics } from '@actora/stores/metrics'
import { panelKeyOf, sideBySide, ui, useUi, type TileId } from '@actora/stores/ui'
import { Panel } from '@actora/ui/cards/Panel'
import { ChatSheet } from '@actora/ui/ChatSheet'
import { MenuButton } from '@actora/ui/Menu'
import { HomeActions } from '@actora/ui/HomeBar'
import { useTypeAnywhere } from '@actora/ui/typeAnywhere'
import { OptionRail } from '@actora/ui/OptionRail'
import { Toaster } from '@actora/ui/Toast'
import { ROLE } from '@actora/ui/brand'
import { roomForTwo, useFocused, usePaired } from '../look/focus'
import { FOCUS_RADIUS, FOCUS_RAIL, useFocusHost } from '../look/focusHost'
import { anchorRef } from '../scene/Anchor'
import { useReady } from '../look/ready'
import { useCaption } from '../look/caption'
import { Loader } from './Loader'
import { Activity } from '@actora/ui/Activity'
import { useAgent } from '@actora/stores/agent'
import { useGifts } from '@actora/stores/gifts'

// Panels shown only once something is opened: their own chunks, fetched on idle
// after the scene is revealed (prefetchPanels), so opening one is still instant.
const panels = {
  item: () => import('@actora/ui/cards/ItemPanel'),
  finds: () => import('@actora/ui/cards/FindsPanel'),
  vault: () => import('@actora/ui/cards/VaultPanel'),
  people: () => import('@actora/ui/people/PeoplePanel'),
  calendar: () => import('@actora/ui/tiles/Calendar'),
  goals: () => import('@actora/ui/tiles/Goals'),
  inbox: () => import('@actora/ui/tiles/Inbox'),
  tasks: () => import('@actora/ui/tiles/Tasks'),
  date: () => import('@actora/ui/DateSheet'),
  keyboard: () => import('@actora/ui/KeyboardSheet'),
  past: () => import('@actora/ui/PastChats'),
  gift: () => import('@actora/ui/gifts/GiftViewer'),
}
const ItemPanel = lazy(() => panels.item().then((m) => ({ default: m.ItemPanel })))
const FindsPanel = lazy(() => panels.finds().then((m) => ({ default: m.FindsPanel })))
const VaultPanel = lazy(() => panels.vault().then((m) => ({ default: m.VaultPanel })))
const PeoplePanel = lazy(() => panels.people().then((m) => ({ default: m.PeoplePanel })))
const DateSheet = lazy(() => panels.date().then((m) => ({ default: m.DateSheet })))
const KeyboardSheet = lazy(() => panels.keyboard().then((m) => ({ default: m.KeyboardSheet })))
const PastChats = lazy(() => panels.past().then((m) => ({ default: m.PastChats })))
const GiftViewer = lazy(() => panels.gift().then((m) => ({ default: m.GiftViewer })))
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
 * Side by side, the two windows share that one panel: the chat its left half,
 * the other window its right half with its pills at its foot.
 */
function useHostMetrics(w: number, h: number, portrait: boolean, split: boolean) {
  useEffect(() => {
    if (!w || !h) return
    const grid = Math.min(w, h)
    const half = Math.floor(w / 2)
    useMetrics.setState({
      split,
      pair: {
        left: { x: 0, y: 0, w: half, h },
        right: { x: half, y: 0, w: w - half, h: h - FOCUS_RAIL },
        rightRail: { x: half, y: h - FOCUS_RAIL, w: w - half, h: FOCUS_RAIL },
      },
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
  }, [w, h, portrait, split])
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
  const split = roomForTwo(window.innerWidth, window.innerHeight)
  useHostMetrics(host.w, host.h, phone, split)
  useTypeAnywhere()
  // The window narrows past room for two: her chat stays, the window beside it closes.
  useEffect(() => {
    if (!split && sideBySide(useUi.getState())) ui.closePanels()
  }, [split])

  useEffect(() => {
    // Escape closes the top layer only, as in 2D.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && ui.closeTop()
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
          {/* Wide: the message box (chat, mic and menu beside it), then the option boxes under it. */}
          {!phone && <HomeActions onSignOut={onSignOut} />}
          <OptionRail
            contextKey={key}
            icons={phone}
            // Wide: the same width as the message box above, so the boxes line up under it.
            className={phone ? '' : 'mx-auto w-full max-w-[780px]'}
            trailing={<MenuButton onSignOut={onSignOut} />}
          />
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
        {sheets.gift && <GiftViewer />}
      </Suspense>
      <Toaster />
      <Loader />
    </MotionConfig>
  )
}

/** The open thing, filling the in-scene panel; its options below it, never cut off. */
function FocusContent({ focused }: { focused: boolean }) {
  const m = useMetrics(useShallow((s) => ({ panel: s.panel, rail: s.rail, pair: s.pair })))
  const paired = usePaired()
  const key = useContextKey()
  const panelKey = useUi(panelKeyOf)
  // Side by side: the window beside the chat, its pills under it, a line between the two.
  const box = paired ? m.pair.right : m.panel
  const rail = paired ? m.pair.rightRail : m.rail
  const chatOpen = useUi((s) => s.chatOpen)
  const focus = useUi((s) => s.focus)
  const selected = useUi((s) => s.selected)
  const finds = useUi((s) => s.finds)
  const vault = useUi((s) => s.vault)
  const people = useUi((s) => s.people)
  const item = !focus && selected ? selected : null

  return (
    <>
      <div
        className={`absolute ${paired ? 'border-l border-line' : ''}`}
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      >
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
          {people && (
            <Suspense key="people" fallback={null}>
              <PeoplePanel />
            </Suspense>
          )}
        </AnimatePresence>
      </div>
      {focused && (!chatOpen || paired) && (
        <div
          className={`absolute flex items-center border-t border-line px-5 pb-1 ${paired ? 'border-l' : ''}`}
          style={{ left: rail.x, top: rail.y, width: rail.w, height: rail.h }}
        >
          <OptionRail
            className="w-full"
            contextKey={paired ? panelKey : key}
            trailing={<MenuButton onSignOut={onSignOut} />}
          />
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
            width: phone ? '90%' : '40%',
            fontSize: phone ? 17 : 'clamp(22px, 2.2vw, 32px)',
            color,
            textShadow: '0 1px 12px color-mix(in srgb, var(--t-bg) 70%, transparent)',
          }}
          initial={{ opacity: 0, y: 6 }}
          // No delay: her words show the moment they arrive, never after a beat (rule 2).
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Which of the screen-level sheets have been wanted yet: each mounts on first use and stays. */
function useSheetsWanted(): { keyboard: boolean; past: boolean; date: boolean; gift: boolean } {
  const now = useUi(useShallow((s) => ({ keyboard: s.keyboardOpen, past: s.pastChats, date: s.picking !== null })))
  // Her gift, shown large (from the chat, the profile or "Open" on its note).
  const gift = useGifts((s) => s.open !== null)
  const [seen, setSeen] = useState({ ...now, gift })
  if ((now.keyboard && !seen.keyboard) || (now.past && !seen.past) || (now.date && !seen.date) || (gift && !seen.gift))
    setSeen({
      keyboard: seen.keyboard || now.keyboard,
      past: seen.past || now.past,
      date: seen.date || now.date,
      gift: seen.gift || gift,
    })
  return seen
}
