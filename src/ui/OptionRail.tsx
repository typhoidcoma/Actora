import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { runOption, toggleVoice } from '../options/run'
import type { Option } from '../options/types'
import { placeInSlots } from '../options/slots'
import { useOptions } from '../options/useOptions'
import { useAgent } from '../stores/agent'
import { optionsStore, useOptionsStore } from '../stores/options'
import { ui } from '../stores/ui'
import { jelly } from './motion'
import { sheen } from './sheen'
import { useMetrics } from '../stores/metrics'

/**
 * The user's voice: what they can say or do next, always. Context-aware chips
 * (instant local ones, refined by the agent). The orb is the microphone; the
 * keyboard is tucked at the end. Nothing in the app requires typing.
 */
export function OptionRail({
  contextKey,
  className = '',
  trailing,
  icons = true,
}: {
  contextKey: string
  className?: string
  trailing?: React.ReactNode
  /** Wide screens: false when chat and the menu sit beside a message box instead (HomeActions). */
  icons?: boolean
}) {
  const { options, loading } = useOptions(contextKey)
  const busy = useAgent((s) => s.awaitingTurn || s.turnId !== null)
  const offline = useAgent((s) => s.connection !== 'open')
  const listening = useOptionsStore((s) => s.listening)
  const interim = useOptionsStore((s) => s.interim)
  const narrow = useMetrics((s) => s.compact)
  const stableSlots = useStableSlots(options, narrow ? 4 : 6)
  // Inside the chat there's a real message box, so no keyboard/chat buttons here.
  const inChat = contextKey === 'chat'
  // Count what the user actually got to see (settled, not mid-turn), for staleness.
  const shownIds = options.map((o) => o.id).join('|')
  useEffect(() => {
    if (busy || loading || !shownIds) return
    const t = setTimeout(() => optionsStore.noteShown(options), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the visible ids
  }, [shownIds, busy, loading])

  // The agent hears which pills are up, so "the second one" or a pill she can see means something to her.
  const shownLabels = (listening ? [] : stableSlots.filter((o): o is Option => !!o)).map((o) => o.label).join('\n')
  useEffect(() => {
    optionsStore.setVisible(contextKey, shownLabels ? shownLabels.split('\n') : [])
  }, [contextKey, shownLabels])

  const iconRow = (
    <div className="flex shrink-0 items-center gap-1.5 pr-1">
      {contextKey !== 'chat' && (
        <motion.button
          whileTap={jelly}
          onClick={ui.openChat}
          aria-label="Open the conversation"
          className="glass-pill grid h-10 w-10 place-items-center rounded-[8px] text-muted"
        >
          <ChatIcon />
        </motion.button>
      )}
      <motion.button
        whileTap={jelly}
        onClick={() => ui.keyboard(true)}
        // Works offline too: what's typed is kept as a task (KeyboardSheet).
        aria-label="Type instead"
        className="glass-pill grid h-10 w-10 place-items-center rounded-[8px] text-muted disabled:opacity-40"
      >
        <KeyboardIcon />
      </motion.button>
      {trailing}
    </div>
  )

  // One grid of fixed boxes on every screen: a phone's 2×2 beside chat and the
  // menu, or 3×2 wide with the icons beside it. The boxes never change size or
  // move; when the options change (moving between screens, her options arriving
  // after the instant ones) only the words in the boxes that changed cross-fade,
  // so nothing around the rail reflows. Typing lives in the menu on phones (the
  // chat has its own message box).
  const grid = (
    <div
      className={`grid min-w-0 flex-1 grid-rows-[44px_44px] gap-2 ${
        narrow ? 'grid-cols-[repeat(2,minmax(0,1fr))]' : 'grid-cols-[repeat(3,minmax(0,1fr))]'
      }`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {listening ? (
          <motion.button
            key="listening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleVoice}
            className={`glass-pill col-span-full row-span-2 flex min-w-0 items-center gap-3 rounded-[8px] px-4 text-left text-strong ${
              narrow ? 'text-[15px]' : 'text-[16px]'
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-urgent" aria-hidden />
            <span className="line-clamp-2">{interim || 'Listening…'}</span>
          </motion.button>
        ) : (
          stableSlots.map((o, i) => (
            <Tile
              key={`slot-${i}`}
              option={o}
              loading={loading}
              wide={!narrow}
              disabled={!o || offline || (busy && !o.act)}
              // Nothing to offer here (People has no pills): the space stays, without a row of empty boxes that look broken.
              blank={!loading && stableSlots.every((s) => !s)}
            />
          ))
        )}
      </AnimatePresence>
    </div>
  )

  if (narrow) {
    return (
      <div className={`flex items-stretch gap-2 ${className}`}>
        {grid}
        {/* In the chat, the message box (Composer) replaces these. */}
        {!inChat && (
          <div className="flex shrink-0 flex-col justify-between gap-2">
            {/* Phones: chat here; typing lives in the menu ("Type instead"). */}
            <motion.button
              whileTap={jelly}
              onClick={ui.openChat}
              aria-label="Open the conversation"
              className="glass-pill grid h-[44px] w-11 place-items-center rounded-[8px] text-muted"
            >
              <ChatIcon />
            </motion.button>
            {trailing}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {grid}
      {!inChat && icons && iconRow}
    </div>
  )
}

function useStableSlots(options: Option[], n: number): Array<Option | null> {
  const [state, setState] = useState<{ from: Option[]; slots: Array<Option | null> }>(() => ({
    from: options,
    slots: placeInSlots([], options, n),
  }))
  if (state.from !== options) {
    const slots = placeInSlots(state.slots, options, n)
    setState({ from: options, slots })
    return slots
  }
  return state.slots
}

/**
 * An option: one fixed box of the grid, up to two lines. The cell
 * stays put; only its words cross-fade when the option in it changes. An empty
 * cell is a quiet placeholder (shimmering while the agent's options are on the way).
 */
function Tile({
  option,
  loading,
  disabled,
  blank = false,
  wide = false,
}: {
  option: Option | null
  loading: boolean
  /** Wide screens: a box with more room, so the words are a touch bigger (as the old pills were). */
  wide?: boolean
  disabled: boolean
  blank?: boolean
}) {
  // Always the same element, filled or not, so a slot filling in never remounts.
  return (
    <motion.button
      initial={false}
      whileTap={option ? jelly : undefined}
      {...(option ? sheen : {})}
      disabled={disabled}
      tabIndex={option ? undefined : -1}
      aria-hidden={option ? undefined : true}
      aria-label={option?.label}
      onClick={() => option && runOption(option)}
      className={`glass-pill flex min-w-0 items-center overflow-hidden rounded-[8px] px-3 text-left leading-[1.2] ${wide ? 'text-[15px]' : 'text-[13.5px]'} transition-opacity ${blank ? 'invisible' : ''} ${
        !option ? `opacity-50 ${loading ? 'shimmer' : ''}` : 'disabled:opacity-40'
      } ${option?.act ? 'font-medium text-strong' : 'text-text'}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {option && (
          <motion.span
            key={option.id}
            className="line-clamp-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {option.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h0a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M8 14h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
