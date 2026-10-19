import { motion } from 'motion/react'
import { say, toggleVoice } from '../options/run'
import { agentName } from '../stores/agent'
import { useOptionsStore } from '../stores/options'
import { ui } from '../stores/ui'
import { MenuButton } from './Menu'
import { jelly } from './motion'
import { useDraft } from './typeAnywhere'

/**
 * The row under the pills on wide screens: a message box (Enter sends), the
 * microphone, the conversation and the menu, all one height.
 */
export function HomeActions({ onSignOut, className = '' }: { onSignOut?: () => void; className?: string }) {
  return (
    <div className={`home-actions mx-auto flex w-full max-w-[780px] items-center gap-2 ${className}`}>
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
      <MenuButton onSignOut={onSignOut} large />
    </div>
  )
}

function MessageBox() {
  const text = useDraft((s) => s.text)
  return (
    <input
      name="message"
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
