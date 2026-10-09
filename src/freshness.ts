import { useAgent } from './stores/agent'
import { panelOpen, useUi } from './stores/ui'

/**
 * An open tab keeps running the build it loaded with, so fixes pushed since
 * never reach it. Check for a new deploy when the app comes back into view
 * (and every 10 min), and reload onto it once the user is idle at home: no
 * panel, no conversation, no turn in flight, no keyboard.
 */
const CHECK_MS = 10 * 60_000
const entry = (html: string) => /\/assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null

export function startFreshness(): () => void {
  const current = entry(document.documentElement.outerHTML)
  if (!current) return () => {}
  let waiting = false

  const idleHome = () => {
    const u = useUi.getState()
    const a = useAgent.getState()
    return !panelOpen(u) && !u.chatOpen && !u.keyboardOpen && !a.turnId && !a.awaitingTurn && a.streaming === null
  }
  const reloadWhenIdle = () => {
    if (idleHome()) return window.location.reload()
    if (waiting) return
    waiting = true
    const off = useUi.subscribe(() => {
      if (!idleHome()) return
      off()
      window.location.reload()
    })
  }
  const check = async () => {
    if (waiting) return
    try {
      const res = await fetch('/', { cache: 'no-store' })
      const latest = res.ok ? entry(await res.text()) : null
      if (latest && latest !== current) reloadWhenIdle()
    } catch {
      /* offline: try again later */
    }
  }

  const onVisible = () => document.visibilityState === 'visible' && void check()
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => void check(), CHECK_MS)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}
