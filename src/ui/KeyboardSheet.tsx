import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { say } from '../options/run'
import { captureTask } from '../aelora/client'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { jelly, morph } from './motion'

/** The tucked-away text fallback: a single glass input that rises above the rail. */
export function KeyboardSheet() {
  const open = useUi((s) => s.keyboardOpen)
  return <AnimatePresence>{open && <Sheet key="kb" />}</AnimatePresence>
}

function Sheet() {
  const m = useMetrics()
  const chatOpen = useUi((s) => s.chatOpen)
  const busy = useAgent((s) => s.awaitingTurn || s.turnId !== null)
  const offline = useAgent((s) => s.connection !== 'open')
  const [text, setText] = useState('')
  const w = Math.min(m.vw - 24, 680)
  // Wendy can't take it right now (busy, or no connection): keep the thought as a task instead.
  const captureOnly = busy || offline

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim()) return
    if (captureOnly) {
      void captureTask(text)
      setText('')
      ui.keyboard(false)
      return
    }
    if (say(text)) {
      setText('')
      ui.keyboard(false)
    }
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => ui.keyboard(false)}
      />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={morph}
        className="glass glass-thick fixed z-50 flex items-center gap-2 p-2"
        style={{
          left: (m.vw - w) / 2,
          bottom: chatOpen ? 24 : m.rail.h + 8,
          width: w,
          borderRadius: 10,
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && ui.keyboard(false)}
          placeholder={
            captureOnly
              ? offline
                ? 'Offline: jot it down as a task'
                : "Wendy's busy: jot it down as a task"
              : 'Say anything to Wendy'
          }
          aria-label={captureOnly ? 'Save as a task' : 'Message Wendy'}
          enterKeyHint={captureOnly ? 'done' : 'send'}
          className="h-12 min-w-0 flex-1 rounded-full bg-transparent px-4 text-strong placeholder:text-faint focus:outline-none"
        />
        {captureOnly ? (
          <motion.button
            whileTap={jelly}
            type="submit"
            disabled={!text.trim()}
            className="h-12 shrink-0 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent transition-opacity disabled:opacity-35"
          >
            Save as task
          </motion.button>
        ) : (
          <motion.button
            whileTap={jelly}
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-opacity disabled:opacity-35"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4">
              <path
                d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
                stroke="currentColor"
                strokeWidth={1.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        )}
      </motion.form>
    </>
  )
}
