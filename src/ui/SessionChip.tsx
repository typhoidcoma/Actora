import { AnimatePresence, motion } from 'motion/react'
import { endFocus } from '../aelora/client'
import { useSession } from '../stores/session'
import { press } from './motion'
import { useMetrics } from '../stores/metrics'
import { useNow } from './tiles/data'

/** A running focus session: what it's on and how long, with End. Top-left, clear of the orb. */
export function SessionChip() {
  const s = useSession((x) => x.active)
  return <AnimatePresence>{s && <Chip key={s.id} />}</AnimatePresence>
}

function Chip() {
  const s = useSession((x) => x.active)
  const now = useNow(1000)
  // Stacked phones: the orb sits top-centre, so the chip keeps to the left of it (time + End only).
  const stack = useMetrics((m) => m.stack)
  const orb = useMetrics((m) => m.orb)
  const vw = useMetrics((m) => m.vw)
  if (!s) return null
  const secs = Math.max(0, Math.floor((now - Date.parse(s.started_at)) / 1000))
  const h = Math.floor(secs / 3600)
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="glass glass-thick fixed z-30 flex h-11 max-w-[min(70vw,360px)] items-center gap-2.5 rounded-full py-1 pr-1 pl-3.5"
      style={{
        top: 'max(10px, env(safe-area-inset-top))',
        left: 12,
        ...(stack ? { maxWidth: vw / 2 - orb / 2 - 20 } : {}),
      }}
      role="status"
      aria-label={`Focus session${s.anchor_response ? ` on ${s.anchor_response}` : ''}, ${Math.floor(secs / 60)} minutes`}
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
      <span className="num shrink-0 text-[14px] font-semibold text-strong">
        {h ? `${h}:` : ''}
        {mm}:{ss}
      </span>
      {s.anchor_response && !stack && (
        <span className="min-w-0 truncate text-[13px] text-muted">{s.anchor_response}</span>
      )}
      <motion.button
        whileTap={press}
        onClick={() => void endFocus()}
        className="glass-pill h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold text-strong"
      >
        End
      </motion.button>
    </motion.div>
  )
}
