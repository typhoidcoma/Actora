import { AnimatePresence, motion } from 'motion/react'
import { runOption, toggleVoice } from '../options/run'
import type { Option } from '../options/types'
import { useOptions } from '../options/useOptions'
import { useAgent } from '../stores/agent'
import { useOptionsStore } from '../stores/options'
import { ui } from '../stores/ui'
import { jelly, morph } from './motion'
import { sheen } from './sheen'

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

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Up to two centred rows; labels truncate rather than spill under the icons. */}
      <div className="flex max-h-[108px] min-w-0 flex-1 flex-wrap content-center items-center justify-center gap-2 overflow-hidden px-1 py-1.5">
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
              className="glass-pill flex h-12 w-full min-w-0 items-center gap-3 rounded-[12px] px-5 text-left text-[15px] text-strong"
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
              className="glass-pill shimmer h-11 w-24 shrink-0 rounded-[12px]"
              aria-hidden
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pr-1">
        {contextKey !== 'chat' && (
          <motion.button
            whileTap={jelly}
            onClick={ui.openChat}
            aria-label="Open the conversation"
            className="glass-pill grid h-10 w-10 place-items-center rounded-[12px] text-muted"
          >
            <ChatIcon />
          </motion.button>
        )}
        <motion.button
          whileTap={jelly}
          onClick={() => ui.keyboard(true)}
          disabled={offline}
          aria-label="Type instead"
          className="glass-pill grid h-10 w-10 place-items-center rounded-[12px] text-muted disabled:opacity-40"
        >
          <KeyboardIcon />
        </motion.button>
        {trailing}
      </div>
    </div>
  )
}

function Chip({ option, index, disabled }: { option: Option; index: number; disabled: boolean }) {
  const fromWendy = option.source !== 'local'
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14, scale: 0.92, filter: 'blur(4px)' }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: { type: 'spring', stiffness: 380, damping: 26, delay: index * 0.05 },
      }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
      whileTap={jelly}
      {...sheen}
      disabled={disabled}
      onClick={() => runOption(option)}
      className={`glass-pill flex h-11 max-w-full min-w-0 items-center gap-2 rounded-[12px] px-4 text-[15px] whitespace-nowrap transition-opacity disabled:opacity-40 ${
        option.act ? 'font-medium text-strong' : 'text-text'
      }`}
    >
      {fromWendy && (
        <span aria-hidden className="shrink-0 text-[11px] text-accent">
          ✦
        </span>
      )}
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
