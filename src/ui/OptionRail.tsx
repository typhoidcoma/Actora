import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { runOption, toggleVoice } from '../options/run'
import type { Option } from '../options/types'
import { placeInSlots } from '../options/slots'
import { useOptions } from '../options/useOptions'
import { useAgent } from '../stores/agent'
import { optionsStore, useOptionsStore } from '../stores/options'
import { ui } from '../stores/ui'
import { jelly, morph } from './motion'
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
}: {
  contextKey: string
  className?: string
  trailing?: React.ReactNode
}) {
  const { options, loading } = useOptions(contextKey)
  const busy = useAgent((s) => s.awaitingTurn || s.turnId !== null)
  const offline = useAgent((s) => s.connection !== 'open')
  const listening = useOptionsStore((s) => s.listening)
  const interim = useOptionsStore((s) => s.interim)
  const narrow = useMetrics((s) => s.compact)
  const stableSlots = useStableSlots(options, 4)
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

  const pills = (
    <AnimatePresence mode="popLayout" initial={false}>
      {listening ? (
        <motion.button
          key="listening"
          layout
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={morph}
          onClick={toggleVoice}
          className="glass-pill flex h-12 w-full min-w-0 items-center gap-3 rounded-[8px] px-5 text-left text-[15px] text-strong"
        >
          <motion.svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px] shrink-0 text-urgent"
            aria-hidden
            animate={{ scale: [1, 1.15, 1], opacity: [1, 0.65, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          >
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path
              d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          </motion.svg>
          <span className="truncate">{interim || 'Listening…'}</span>
        </motion.button>
      ) : (
        options.map((o, i) => <Chip key={o.id} option={o} index={i} disabled={offline || (busy && !o.act)} />)
      )}
      {!listening && loading && (
        <motion.span
          key="loading"
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="glass-pill shimmer h-11 w-24 shrink-0 rounded-[8px]"
          aria-hidden
        />
      )}
    </AnimatePresence>
  )

  // Phone: a tidy 2×2 grid of equal tiles (the four most relevant, two lines of
  // text each) with chat and the menu in a column beside it. Nothing reflows
  // around anything, and the menu isn't inside a clipped box. Typing lives in
  // the menu here (the chat has its own message box).
  // The four tiles are fixed slots: moving between screens (and the agent's options
  // arriving after the instant ones) only cross-fades the words in the tiles
  // that changed, so the grid never flashes, collapses or reflows.
  if (narrow) {
    const slots = stableSlots
    return (
      <div className={`flex items-stretch gap-2 ${className}`}>
        <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-[44px_44px] gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {listening ? (
              <motion.button
                key="listening"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={toggleVoice}
                className="glass-pill col-span-2 row-span-2 flex min-w-0 items-center gap-3 rounded-[8px] px-4 text-left text-[15px] text-strong"
              >
                <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-urgent" aria-hidden />
                <span className="line-clamp-2">{interim || 'Listening…'}</span>
              </motion.button>
            ) : (
              slots.map((o, i) => (
                <Tile key={`slot-${i}`} option={o} loading={loading} disabled={!o || offline || (busy && !o.act)} />
              ))
            )}
          </AnimatePresence>
        </div>
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
      {/* Up to two centred rows, most relevant first; long labels truncate rather than spill. */}
      <div className="flex max-h-[108px] min-w-0 flex-1 flex-wrap content-center items-center justify-center gap-2 overflow-hidden px-1 py-1.5">
        {pills}
      </div>
      {!inChat && iconRow}
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
 * A phone option: one fixed cell of the 2×2 grid, up to two lines. The cell
 * stays put; only its words cross-fade when the option in it changes. An empty
 * cell is a quiet placeholder (shimmering while the agent's options are on the way).
 */
function Tile({ option, loading, disabled }: { option: Option | null; loading: boolean; disabled: boolean }) {
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
      className={`glass-pill flex min-w-0 items-center overflow-hidden rounded-[8px] px-3 text-left text-[13.5px] leading-[1.2] transition-opacity ${
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

function Chip({ option, index, disabled }: { option: Option; index: number; disabled: boolean }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14, scale: 0.92, filter: 'blur(4px)' }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: {
          type: 'spring',
          stiffness: 380,
          damping: 26,
          delay: index * 0.05,
          filter: { duration: 0.3, ease: 'easeOut', delay: index * 0.05 },
        },
      }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
      whileTap={jelly}
      {...sheen}
      disabled={disabled}
      onClick={() => runOption(option)}
      className={`glass-pill flex h-11 max-w-full min-w-0 items-center gap-2 rounded-[8px] px-4 text-[15px] whitespace-nowrap transition-opacity disabled:opacity-40 ${
        option.act ? 'font-medium text-strong' : 'text-text'
      }`}
    >
      <span className="truncate">{option.label}</span>
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
