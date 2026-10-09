import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { disablePush, enablePush, INSTALL_HELP, testPush } from '../push/push'
import { agent, useAgent } from '../stores/agent'
import { usePush } from '../stores/push'
import { useShallow } from 'zustand/react/shallow'
import { useEntities } from '../stores/entities'
import { ui, useUi, type ThemeMode, type TileId } from '../stores/ui'
import { useSky, type Sky } from '../weather/sky'
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
  if (phase === 'thinking') return { text: `${botName} is thinking`, tone: 'busy' }
  if (phase === 'tool') return { text: toolLabel(tool) || 'Working', tone: 'busy' }
  if (phase === 'speaking') return { text: `${botName} is talking`, tone: 'busy' }
  return { text: botName, tone: 'ok' }
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

function Weather() {
  const sky = useSky()
  if (sky.source !== 'live' || sky.temp === null) return null
  return (
    <span className="hidden text-[13px] text-muted sm:block">
      <span className="num text-text">{Math.round(sky.temp)}°</span> {SKY_LABEL[sky.kind]}
    </span>
  )
}

const TONE = { ok: '#6E9C92', busy: '#EB7B59', warn: '#CF4647' } as const
const THEME_NEXT: Record<ThemeMode, ThemeMode> = { auto: 'day', day: 'dusk', dusk: 'auto' }
const THEME_LABEL: Record<ThemeMode, string> = { auto: 'Follows the sun', day: 'Daylight', dusk: 'Dusk' }

export function Header({ onSignOut }: { onSignOut?: () => void }) {
  const now = useNow(10_000)
  const status = useStatus()
  const email = useAgent((s) => s.email)
  const theme = useUi((s) => s.theme)
  const push = usePush((s) => s.status)
  const [menu, setMenu] = useState(false)
  const close = () => setMenu(false)

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-[max(20px,env(safe-area-inset-left))] pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex h-11 items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-gradient-to-br from-accent to-calm" aria-hidden />
          <span className="display hidden text-[20px] leading-none font-bold text-strong sm:block">actora</span>
        </div>
        <DomainButtons />
      </div>

      <div className="relative flex items-center gap-4">
        <Weather />
        <span className="num hidden text-[13px] text-muted sm:block">{clockTime(now)}</span>
        <motion.button
          whileTap={press}
          onClick={() => setMenu((v) => !v)}
          className="glass-pill flex h-11 items-center gap-2 rounded-full px-4"
          aria-label="Status and settings"
          aria-expanded={menu}
        >
          <motion.span
            className="h-2 w-2 rounded-full"
            style={{ background: TONE[status.tone] }}
            animate={status.tone === 'ok' ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
            transition={status.tone === 'ok' ? undefined : { duration: 1.2, repeat: Infinity }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status.text}
              className="text-[13px] font-medium text-text"
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
              className="glass glass-thick absolute top-[52px] right-0 w-72 origin-top-right p-2"
              style={{ borderRadius: 20 }}
            >
              <div className="truncate px-3 pt-2 pb-2 text-sm text-muted">{email ?? 'Signed in'}</div>
              <MenuItem onClick={() => ui.setTheme(THEME_NEXT[theme])} hint={THEME_LABEL[theme]}>
                Look
              </MenuItem>
              {push === 'on' && (
                <>
                  <MenuItem onClick={() => void disablePush().then(close)} hint="On">
                    Reminders
                  </MenuItem>
                  <MenuItem onClick={() => void testPush().then(close)}>Send a test reminder</MenuItem>
                </>
              )}
              {push === 'off' && (
                <MenuItem onClick={() => void enablePush().then(close)} hint="Off">
                  Reminders
                </MenuItem>
              )}
              {push === 'needs-install' && (
                <MenuItem
                  onClick={() => {
                    agent.showMessage(INSTALL_HELP)
                    close()
                  }}
                  hint="Add to Home Screen"
                >
                  Reminders
                </MenuItem>
              )}
              {push === 'denied' && <MenuItem hint="Blocked in browser settings">Reminders</MenuItem>}
              {onSignOut && <MenuItem onClick={onSignOut}>Sign out</MenuItem>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}

function MenuItem({ children, hint, onClick }: { children: ReactNode; hint?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[15px] text-strong transition-colors hover:bg-text/6 active:bg-text/10 disabled:opacity-60"
    >
      <span>{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  )
}

/** Tasks · Calendar · Goals · Inbox: the full lists, one tap away (icons only on phones). */
function DomainButtons() {
  const focus = useUi((s) => s.focus)
  const now = useNow(60_000)
  const counts = useEntities(
    useShallow((s) => ({
      tasks: Object.values(s.tasks).filter((t) => t.status !== 'done' && t.status !== 'skipped').length,
      calendar: Object.values(s.events).filter((e) => {
        const start = Date.parse(e.start_time)
        return Date.parse(e.end_time) > now && start - now < 86_400_000
      }).length,
      goals: Object.values(s.goals).filter((g) => g.status === 'active').length,
      inbox: Object.values(s.notifications).filter((n) => !n.read_at).length,
    })),
  )
  const items: Array<{ id: TileId; label: string; icon: ReactNode }> = [
    { id: 'tasks', label: 'Tasks', icon: <TaskIcon /> },
    { id: 'calendar', label: 'Calendar', icon: <CalIcon /> },
    { id: 'goals', label: 'Goals', icon: <GoalIcon /> },
    { id: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
  ]
  return (
    <nav className="flex items-center gap-1" aria-label="Lists">
      {items.map((it) => {
        const active = focus === it.id
        const count = counts[it.id]
        return (
          <motion.button
            key={it.id}
            whileTap={press}
            onClick={() => ui.focus(active ? null : it.id)}
            aria-label={`${it.label}${count ? `, ${count}` : ''}`}
            aria-pressed={active}
            className={`relative flex h-10 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors md:px-3 ${
              active ? 'bg-strong text-bg' : 'text-muted hover:bg-text/6'
            }`}
          >
            <span className="h-[18px] w-[18px]">{it.icon}</span>
            <span className="hidden md:inline">{it.label}</span>
            {count > 0 && (
              <span
                className={`num min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-bold ${
                  active ? 'bg-bg text-strong' : 'bg-text/12 text-text'
                } max-md:absolute max-md:-top-0.5 max-md:-right-0.5`}
              >
                {count}
              </span>
            )}
          </motion.button>
        )
      })}
    </nav>
  )
}

const ico = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const
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
