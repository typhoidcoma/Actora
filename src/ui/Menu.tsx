import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { disablePush, enablePush, INSTALL_HELP, testPush } from '../push/push'
import { agent, useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { usePush } from '../stores/push'
import { ui, useUi, type ThemeMode, type TileId } from '../stores/ui'
import { useSky, type Sky } from '../weather/sky'
import { clockTime, toolLabel } from './format'
import { jelly } from './motion'
import { useNow } from './tiles/data'
import { ROLE } from './brand'

function useStatus(): { text: string; tone: 'ok' | 'busy' | 'warn' } {
  const connection = useAgent((s) => s.connection)
  const phase = useAgent((s) => s.phase)
  const tool = useAgent((s) => s.toolName)
  const botName = useAgent((s) => s.botName)
  if (connection === 'connecting') return { text: 'Connecting…', tone: 'busy' }
  if (connection === 'reconnecting') return { text: 'Reconnecting…', tone: 'warn' }
  if (connection !== 'open') return { text: 'Offline', tone: 'warn' }
  if (phase === 'thinking') return { text: `${botName} is thinking`, tone: 'busy' }
  if (phase === 'tool') return { text: toolLabel(tool) || 'Working', tone: 'busy' }
  if (phase === 'speaking') return { text: `${botName} is talking`, tone: 'busy' }
  return { text: `${botName} is here`, tone: 'ok' }
}

const SKY_LABEL: Record<Sky['kind'], string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Overcast',
  fog: 'Fog',
  rain: 'Rain',
  storm: 'Storms',
  snow: 'Snow',
}
const TONE = ROLE.status
const THEME_NEXT: Record<ThemeMode, ThemeMode> = { auto: 'day', day: 'dusk', dusk: 'auto' }
const THEME_LABEL: Record<ThemeMode, string> = { auto: 'Follows the sun', day: 'Daylight', dusk: 'Dusk' }

/**
 * Everything that used to live in the top bar, behind one button at the end of
 * the rail: connection status, the full lists, look, reminders, sign out.
 * The button's dot mirrors the connection, so status is never hidden.
 */
export function MenuButton({ onSignOut }: { onSignOut?: () => void }) {
  const [open, setOpen] = useState(false)
  const status = useStatus()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', off)
    return () => window.removeEventListener('pointerdown', off)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={jelly}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Menu · ${status.text}`}
        aria-expanded={open}
        className="glass-pill relative grid h-10 w-10 place-items-center rounded-[8px] text-muted"
      >
        {/* Quiet when all is well; the icon itself tints and pulses only when something's off. */}
        <motion.span
          style={{ color: status.tone === 'ok' ? undefined : TONE[status.tone] }}
          animate={status.tone === 'ok' ? { opacity: 1 } : { opacity: [1, 0.4, 1] }}
          transition={status.tone === 'ok' ? undefined : { duration: 1.2, repeat: Infinity }}
        >
          <MenuIcon />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && <Sheet status={status} onSignOut={onSignOut} close={() => setOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

function Sheet({
  status,
  onSignOut,
  close,
}: {
  status: { text: string; tone: keyof typeof TONE }
  onSignOut?: () => void
  close: () => void
}) {
  const now = useNow(10_000)
  const sky = useSky()
  const email = useAgent((s) => s.email)
  const theme = useUi((s) => s.theme)
  const push = usePush((s) => s.status)
  const counts = useEntities(
    useShallow((s) => ({
      tasks: Object.values(s.tasks).filter((t) => t.status !== 'done' && t.status !== 'skipped').length,
      calendar: Object.values(s.events).filter(
        (e) => Date.parse(e.end_time) > now && Date.parse(e.start_time) - now < 86_400_000,
      ).length,
      goals: Object.values(s.goals).filter((g) => g.status === 'active').length,
      inbox: Object.values(s.notifications).filter((n) => !n.read_at).length,
    })),
  )
  const lists: Array<{ id: TileId; label: string; icon: ReactNode }> = [
    { id: 'tasks', label: 'Tasks', icon: <TaskIcon /> },
    { id: 'calendar', label: 'Calendar', icon: <CalIcon /> },
    { id: 'goals', label: 'Goals', icon: <GoalIcon /> },
    { id: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
  ]
  const go = (fn: () => void) => () => {
    fn()
    close()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      className="glass glass-thick absolute right-0 bottom-[52px] z-50 w-72 origin-bottom-right p-2"
      style={{ borderRadius: 10 }}
    >
      <div
        className="px-3 pt-2 pb-1 text-[14px] font-semibold"
        style={{ color: status.tone === 'ok' ? undefined : TONE[status.tone] }}
      >
        <span className={status.tone === 'ok' ? 'text-strong' : ''}>{status.text}</span>
      </div>
      <div className="px-3 pb-2 text-xs text-muted">
        <span className="num">{clockTime(now)}</span>
        {sky.source === 'live' && sky.temp !== null && (
          <>
            {' · '}
            <span className="num">{Math.round(sky.temp)}°</span> {SKY_LABEL[sky.kind]}
          </>
        )}
        {email && ` · ${email}`}
      </div>
      <div className="my-1 grid grid-cols-2 gap-1">
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={go(() => ui.focus(l.id))}
            className="flex h-11 items-center gap-2 rounded-[6px] px-3 text-[14px] font-medium text-strong transition-colors hover:bg-text/6 active:bg-text/10"
          >
            <span className="h-[18px] w-[18px] text-muted">{l.icon}</span>
            {l.label}
            {counts[l.id] > 0 && <span className="num ml-auto text-xs text-muted">{counts[l.id]}</span>}
          </button>
        ))}
      </div>
      <div className="my-1 h-px bg-line" />
      <Item onClick={() => ui.setTheme(THEME_NEXT[theme])} hint={THEME_LABEL[theme]}>
        Look
      </Item>
      {push === 'on' && (
        <>
          <Item onClick={() => void disablePush().then(close)} hint="On">
            Reminders
          </Item>
          <Item onClick={() => void testPush().then(close)}>Send a test reminder</Item>
        </>
      )}
      {push === 'off' && (
        <Item onClick={() => void enablePush().then(close)} hint="Off">
          Reminders
        </Item>
      )}
      {push === 'needs-install' && (
        <Item onClick={go(() => agent.showMessage(INSTALL_HELP))} hint="Add to Home Screen">
          Reminders
        </Item>
      )}
      {push === 'denied' && <Item hint="Blocked in browser settings">Reminders</Item>}
      {onSignOut && <Item onClick={onSignOut}>Sign out</Item>}
    </motion.div>
  )
}

function Item({ children, hint, onClick }: { children: ReactNode; hint?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex h-11 w-full items-center justify-between gap-3 rounded-[6px] px-3 text-left text-[15px] text-strong transition-colors hover:bg-text/6 active:bg-text/10 disabled:opacity-60"
    >
      <span>{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  )
}

const ico = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const
const MenuIcon = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
    <path d="M5 8h14M5 12h14M5 16h9" {...ico} />
  </svg>
)
const TaskIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="8.5" {...ico} />
    <path d="M8.5 12.3l2.4 2.4 4.6-5" {...ico} />
  </svg>
)
const CalIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <rect x="4" y="5.5" width="16" height="14" rx="3" {...ico} />
    <path d="M4 10h16M9 3.5v4M15 3.5v4" {...ico} />
  </svg>
)
const GoalIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="8.5" {...ico} />
    <circle cx="12" cy="12" r="4.5" {...ico} />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
)
const InboxIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M4 13.5l2.2-7A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.5l2.2 7V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...ico} />
    <path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20" {...ico} />
  </svg>
)
