import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { runOption, toggleVoice } from '../options/run'
import type { Option } from '../options/types'
import { useOptions } from '../options/useOptions'
import { useAgent } from '../stores/agent'
import { optionsStore, useOptionsStore } from '../stores/options'
import { ui } from '../stores/ui'
import { jelly, morph } from './motion'
import { sheen } from './sheen'
import { useMetrics } from '../stores/metrics'

/**
 * The user's voice: what they can say or do next, always. Context-aware chips
 * (instant local ones, refined by Wendy). The orb is the microphone; the
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
  // the menu here (the chat sheet keeps its keyboard button).
  if (narrow) {
    const shown = options.slice(0, 4)
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
              shown.map((o, i) => <Tile key={o.id} option={o} index={i} disabled={offline || (busy && !o.act)} />)
            )}
            {!listening && loading && shown.length < 4 && (
              <motion.span
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-pill shimmer rounded-[8px]"
                aria-hidden
              />
            )}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 flex-col justify-between gap-2">
          {contextKey !== 'chat' ? (
            <motion.button
              whileTap={jelly}
              onClick={ui.openChat}
              aria-label="Open the conversation"
              className="glass-pill grid h-[44px] w-11 place-items-center rounded-[8px] text-muted"
            >
              <ChatIcon />
            </motion.button>
          ) : (
            <motion.button
              whileTap={jelly}
              onClick={() => ui.keyboard(true)}
              aria-label="Type instead"
              className="glass-pill grid h-[44px] w-11 place-items-center rounded-[8px] text-muted disabled:opacity-40"
            >
              <KeyboardIcon />
            </motion.button>
          )}
          {trailing}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Up to two centred rows, most relevant first; long labels truncate rather than spill. */}
      <div className="flex max-h-[108px] min-w-0 flex-1 flex-wrap content-center items-center justify-center gap-2 overflow-hidden px-1 py-1.5">
        {pills}
      </div>
      {iconRow}
    </div>
  )
}

/** A phone option: one cell of the 2×2 grid, up to two lines. */
function Tile({ option, index, disabled }: { option: Option; index: number; disabled: boolean }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 28, delay: index * 0.04 } }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      whileTap={jelly}
      {...sheen}
      disabled={disabled}
      onClick={() => runOption(option)}
      className={`glass-pill flex min-w-0 items-center rounded-[8px] px-3 text-left text-[13.5px] leading-[1.2] transition-opacity disabled:opacity-40 ${
        option.act ? 'font-medium text-strong' : 'text-text'
      }`}
    >
      <span className="line-clamp-2">{option.label}</span>
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
