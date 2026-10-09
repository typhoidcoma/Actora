import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useAgent } from '../stores/agent'
import { clockTime, toolLabel } from './format'
import { press } from './motion'
import { useNow } from './tiles/data'

function useStatus(): { text: string; tone: 'ok' | 'busy' | 'warn' } {
  const connection = useAgent((s) => s.connection)
  const phase = useAgent((s) => s.phase)
  const tool = useAgent((s) => s.toolName)
  const botName = useAgent((s) => s.botName)
  if (connection === 'connecting') return { text: 'Connecting', tone: 'busy' }
  if (connection === 'reconnecting') return { text: 'Reconnecting', tone: 'warn' }
  if (connection !== 'open') return { text: 'Offline', tone: 'warn' }
  if (phase === 'thinking') return { text: `${botName} · thinking`, tone: 'busy' }
  if (phase === 'tool') return { text: `${botName} · ${toolLabel(tool).toLowerCase() || 'working'}`, tone: 'busy' }
  if (phase === 'speaking') return { text: `${botName} · speaking`, tone: 'busy' }
  return { text: `${botName} · online`, tone: 'ok' }
}

const TONE = { ok: '#CDE04A', busy: '#8FC4F0', warn: '#FF5566' } as const

export function Header({ onSignOut }: { onSignOut?: () => void }) {
  const now = useNow(10_000)
  const status = useStatus()
  const email = useAgent((s) => s.email)
  const [menu, setMenu] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-[max(20px,env(safe-area-inset-left))] pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex h-11 items-center gap-2.5">
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
          <path d="M6 1.5L11 10.5H1z" fill="#FF5566" />
        </svg>
        <span className="num text-[13px] font-medium tracking-[0.32em] text-white">ACTORA</span>
      </div>

      <div className="relative flex items-center gap-4">
        <span className="num hidden text-[13px] text-muted sm:block">{clockTime(now)}</span>
        <motion.button
          whileTap={press}
          onClick={() => setMenu((v) => !v)}
          className="flex h-11 items-center gap-2 rounded-full border border-white/8 bg-white/4 px-4"
          aria-label="Connection status"
        >
          <motion.span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: TONE[status.tone], boxShadow: `0 0 8px ${TONE[status.tone]}` }}
            animate={status.tone === 'ok' ? { opacity: 1 } : { opacity: [1, 0.3, 1] }}
            transition={status.tone === 'ok' ? undefined : { duration: 1.2, repeat: Infinity }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status.text}
              className="num text-xs tracking-wide text-text/80"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16 }}
            >
              {status.text}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              className="glass absolute top-[52px] right-0 w-64 origin-top-right p-2"
              style={{ borderRadius: 18 }}
            >
              <div className="truncate px-3 pt-2 pb-3 text-sm text-muted">{email ?? 'Signed in'}</div>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="h-11 w-full rounded-xl px-3 text-left text-sm text-white transition-colors hover:bg-white/6 active:bg-white/10"
                >
                  Sign out
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
