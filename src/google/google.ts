import { create } from 'zustand'
import { api } from '../aelora/http'
import { config } from '../config'
import { toast } from '../stores/toast'

/**
 * The user's Google connection (one account for Calendar and Gmail), through
 * Aelora's /api/google/calendar/* routes (docs/HTTP-API.md). Wendy's email and
 * invite tools can't run without it, so it lives in the menu, and a tool that
 * fails for want of it offers to connect.
 */
export interface GoogleStatus {
  configured: boolean
  connected: boolean
  google_email?: string | null
  needs_reauth?: boolean
  last_sync_error?: string | null
  gmail_read?: boolean
  gmail_compose?: boolean
}

interface GoogleState {
  status: GoogleStatus | null
  busy: boolean
}

export const useGoogle = create<GoogleState>(() => ({ status: null, busy: false }))

/** What the menu says about it. */
export function googleHint(s: GoogleStatus | null): string {
  if (!s) return '…'
  if (!s.connected) return 'Connect'
  if (s.needs_reauth || !s.gmail_compose) return 'Reconnect'
  return s.google_email ?? 'Connected'
}

/** Reconnecting is needed for Wendy to do email (older grants were calendar-only). */
export const googleNeedsAction = (s: GoogleStatus | null) =>
  !!s && s.configured && (!s.connected || !!s.needs_reauth || !s.gmail_compose)

export async function refreshGoogle(): Promise<GoogleStatus | null> {
  if (config.mock) {
    useGoogle.setState({ status: { configured: true, connected: false } })
    return useGoogle.getState().status
  }
  const r = await api<GoogleStatus>('/api/google/calendar/status').catch(() => null)
  const status = r?.ok ? r.body : null
  useGoogle.setState({ status })
  return status
}

/**
 * Opens Google's consent screen in a popup. The callback page posts a message
 * back when it's done; status is also re-checked while the popup is open, in
 * case that message can't reach us.
 */
export async function connectGoogle(): Promise<void> {
  if (config.mock) return void toast.show('Google connects on the real server.')
  // Open the window inside the tap (popup blockers), then point it at Google.
  const win = window.open('about:blank', 'actora-google', 'width=520,height=680')
  useGoogle.setState({ busy: true })
  const r = await api<{ url?: string }>('/api/google/calendar/connect').catch(() => null)
  if (!r?.ok || !r.body.url) {
    win?.close()
    useGoogle.setState({ busy: false })
    toast.error(r?.status === 503 ? "Google isn't set up on this server yet." : "Couldn't start connecting Google.")
    return
  }
  if (win) win.location.href = r.body.url
  else window.location.href = r.body.url // blocked popup: go there in this tab

  let done = false
  const finish = async () => {
    if (done) return
    done = true
    window.removeEventListener('message', onMessage)
    clearInterval(poll)
    const s = await refreshGoogle()
    useGoogle.setState({ busy: false })
    if (s?.connected) toast.show(`Google connected${s.google_email ? ` · ${s.google_email}` : ''}`)
  }
  const onMessage = (e: MessageEvent) => {
    if (e.origin === new URL(config.baseUrl).origin) void finish()
  }
  window.addEventListener('message', onMessage)
  const started = Date.now()
  const poll = setInterval(() => {
    if (win?.closed || Date.now() - started > 3 * 60_000) void finish()
  }, 1500)
}

export async function syncGoogle(): Promise<void> {
  const r = await api<{ ok?: boolean; error?: string }>('/api/google/calendar/sync', 'POST').catch(() => null)
  // A failed sync is a 400, not ok:false in a 200.
  if (r?.ok) toast.show('Calendar synced with Google')
  else toast.error(r?.body.error ? `Sync failed: ${r.body.error}` : "Couldn't sync with Google.")
  void refreshGoogle()
}

export async function disconnectGoogle(): Promise<void> {
  const r = await api('/api/google/calendar/disconnect', 'POST').catch(() => null)
  if (r?.ok) toast.show('Google disconnected')
  else toast.error("Couldn't disconnect Google.")
  void refreshGoogle()
}

/** A tool failed for want of Google (google_not_connected / _scope_missing / _needs_reauth). */
export function isGoogleError(error: unknown): boolean {
  return typeof error === 'string' && /google_(not_connected|scope_missing|needs_reauth)/.test(error)
}
