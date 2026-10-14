import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { captureTask } from '../aelora/client'
import { say, toggleVoice } from '../options/run'
import { useAgent } from '../stores/agent'
import { useOptionsStore } from '../stores/options'
import { jelly } from './motion'

/**
 * The chat's own message box: always there while the conversation is open, so
 * typing is one tap away (the pills above stay the quick way to answer). The
 * mic talks instead. While the agent is busy or offline, what's typed is kept as a
 * task rather than lost.
 */
export function Composer() {
  const name = useAgent((s) => s.botName)
  const [text, setText] = useState('')
  const busy = useAgent((s) => s.awaitingTurn || s.turnId !== null)
  const offline = useAgent((s) => s.connection !== 'open')
  const listening = useOptionsStore((s) => s.listening)
  const captureOnly = busy || offline

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim()) return
    if (captureOnly) void captureTask(text)
    else if (!say(text)) return
    setText('')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          captureOnly
            ? offline
              ? 'Offline: jot down a task'
              : `Jot a task while ${name} answers`
            : `Message ${name}`
        }
        aria-label={captureOnly ? 'Save as a task' : `Message ${name}`}
        enterKeyHint={captureOnly ? 'done' : 'send'}
        className="glass-pill h-12 min-w-0 flex-1 rounded-full px-5 text-[16px] text-strong placeholder:text-faint focus:outline-none"
      />
      {text.trim() ? (
        <motion.button
          whileTap={jelly}
          type="submit"
          // Keep focus in the box, so the phone keyboard stays up for the next message.
          onPointerDown={(e) => e.preventDefault()}
          aria-label={captureOnly ? 'Save as task' : 'Send'}
          className="grid h-12 min-w-12 shrink-0 place-items-center rounded-full bg-fill px-3.5 text-[14px] font-semibold text-on-accent"
        >
          {captureOnly ? (
            'Save'
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path
                d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
                stroke="currentColor"
                strokeWidth={1.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </motion.button>
      ) : (
        <motion.button
          whileTap={jelly}
          type="button"
          onClick={toggleVoice}
          disabled={offline}
          aria-label={listening ? 'Stop listening' : 'Talk instead'}
          className={`glass-pill grid h-12 w-12 shrink-0 place-items-center rounded-full disabled:opacity-40 ${listening ? 'text-urgent' : 'text-muted'}`}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path
              d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </motion.button>
      )}
    </form>
  )
}
