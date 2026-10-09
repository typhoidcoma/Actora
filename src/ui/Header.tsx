import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { disablePush, enablePush, INSTALL_HELP, testPush } from '../push/push'
import { agent, useAgent } from '../stores/agent'
import { usePush } from '../stores/push'
import { ui, useUi, type ThemeMode } from '../stores/ui'
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

const TONE = { ok: '#6F9F9C', busy: '#E1A36F', warn: '#C9765A' } as const
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
      <div className="flex h-11 items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-gradient-to-br from-apricot to-sage" aria-hidden />
        <span className="display text-[20px] leading-none font-bold text-strong">actora</span>
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
