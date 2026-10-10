import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { usePeek } from '../stores/peek'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { panelOpen, ui, useUi } from '../stores/ui'
import { liveTail, plainText } from './markdownText'
import { press } from './motion'

/**
 * Phones: a panel covers the whole screen, and her line steps back for it. If
 * Wendy is still working or typing there (the chat closed on her, or she opened
 * the panel herself), her latest words show at the top; once she's done it
 * stays as "Wendy replied" until the chat opens or the panel closes. Tap it to
 * open the chat.
 */
export function TypingPeek() {
  const stack = useMetrics((m) => m.stack)
  const { covered, chatOpen } = useUi(useShallow((u) => ({ covered: panelOpen(u), chatOpen: u.chatOpen })))
  const a = useAgent(
    useShallow((s) => ({
      busy: s.awaitingTurn || s.turnId !== null,
      streaming: s.streaming,
      lastId: s.messages.findLast((m) => m.role === 'assistant')?.id ?? null,
      name: s.botName,
    })),
  )
  const hidden = !stack || !covered || chatOpen
  // A reply that finished while it was hidden behind the panel stays flagged until seen.
  const [unread, setUnread] = useState<string | null>(null)
  const [wasBusy, setWasBusy] = useState(a.busy)
  if (wasBusy !== a.busy) {
    setWasBusy(a.busy)
    if (!a.busy && !hidden && a.lastId) setUnread(a.lastId)
  }
  if (hidden && unread !== null) setUnread(null)

  const words = a.streaming ? liveTail(plainText(a.streaming), 90) : ''
  const show = !hidden && (a.busy || unread !== null)
  useEffect(() => usePeek.setState({ shown: show }), [show])
  const label = a.busy ? (words ? '' : `${a.name} is working on it…`) : `${a.name} replied · Read`

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="peek"
          whileTap={press}
          onClick={ui.openChat}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          aria-label={`${a.busy ? `${a.name} is typing` : `${a.name} replied`}. Open the chat`}
          className="glass glass-thick fixed left-1/2 z-40 flex items-center gap-2.5 rounded-[14px] py-2 pr-3 pl-2.5 text-left"
          style={{ x: '-50%', top: 'max(10px, env(safe-area-inset-top))', width: 'min(calc(100vw - 32px), 420px)' }}
        >
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full bg-accent ${a.busy ? 'animate-pulse' : ''}`}
          />
          <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug text-strong">{words || label}</span>
          <span className="shrink-0 text-[13px] font-semibold text-accent">Open</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
