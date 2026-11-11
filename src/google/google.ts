import { create } from 'zustand'
import { api } from '../aelora/http'
import { config } from '../config'
import { toast } from '../stores/toast'
import { GOOGLE_SCOPES, signInWithGoogle } from '../auth/supabase'

/**
 * The user's Google connection (one account for Calendar and Gmail), through
 * Aelora's /api/google/calendar/* routes (docs/HTTP-API.md). The agent's email and
 * invite tools can't run without it, so it lives in the menu, and a tool that
 * fails for want of it offers to connect.
 */
interface GoogleStatus {
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

/** Reconnecting is needed for the agent to do email (older grants were calendar-only). */
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

/** Refresh tokens already handed to Aelora this visit (auth events repeat). */
const linked = new Set<string>()

/**
 * Signing in asked Google for calendar and Gmail too (GOOGLE_SCOPES): the
 * session that comes back from Google carries its refresh token once. Hand it
 * to Aelora, and Google is connected without a separate step.
 */
export async function linkGoogleFromSession(session: {
  access_token: string
  provider_refresh_token?: string | null
}): Promise<void> {
  const rt = session.provider_refresh_token
  if (!rt || linked.has(rt) || config.mock) return
  linked.add(rt)
  try {
    const r = await fetch(`${config.baseUrl}/api/google/calendar/connect-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt, scope: GOOGLE_SCOPES }),
    })
    if (!r.ok) {
      linked.delete(rt) // let a later sign-in try again
      return
    }
    const s = await refreshGoogle()
    toast.show(`Google connected${s?.google_email ? ` · ${s.google_email}` : ''}`)
  } catch {
    linked.delete(rt)
  }
}

const connectedToast = (s: GoogleStatus | null) =>
  toast.show(`Google connected${s?.google_email ? ` · ${s.google_email}` : ''}`)

/** What a refused /finish means, in the user's words. */
export function connectError(status: number, error: unknown): string {
  const e = typeof error === 'string' ? error : ''
  if (status === 403 || e === 'state_user_mismatch') return 'This sign-in was started from another account.'
  if (e === 'no_refresh_token')
    return "Remove Aelora from your Google account's third-party access, then connect again."
  if (/expired state/i.test(e)) return 'That link expired. Try connecting again.'
  if (status === 400) return 'Try connecting again.'
  if (status === 401) return 'Sign in first.'
  if (status === 503) return "Google isn't set up on this server yet."
  return "Couldn't connect Google."
}

/** Codes from Google already handed to Aelora (each works once). */
const redeemed = new Set<string>()
let listening = false
/** Set while a connect is waiting on its popup, so a finished one can end it. */
let endWait: (() => void) | null = null

/**
 * Google's answer comes back from Aelora's callback page as a message to this
 * window. Aelora no longer links Google itself: it hands us the code, and we
 * redeem it as ourselves, so a consent link sent to someone else can't link their
 * Google to this account. Listens for the life of the page, not just while the
 * popup looks open: once Google's page cuts the link to the popup, the browser can
 * report it closed before the code arrives.
 */
export function onGoogleMessage(e: { origin: string; data: unknown }): void {
  if (e.origin !== new URL(config.baseUrl).origin) return
  const d = (e.data ?? {}) as { type?: unknown; code?: unknown; state?: unknown }
  if (d.type !== 'aelora:gcal-code') return
  if (typeof d.code !== 'string' || !d.code || typeof d.state !== 'string' || !d.state) return
  if (redeemed.has(d.code)) return
  redeemed.add(d.code)
  endWait?.()
  void (async () => {
    const r = await api<{ ok?: boolean; error?: string }>('/api/google/calendar/finish', 'POST', {
      code: d.code,
      state: d.state,
    }).catch(() => null)
    const s = await refreshGoogle()
    useGoogle.setState({ busy: false })
    if (r?.ok && r.body.ok) connectedToast(s)
    else toast.error(connectError(r?.status ?? 0, r?.body.error))
  })()
}

/**
 * Opens Google's consent screen in a popup. The popup hands the result back as a
 * message (onGoogleMessage). Some places give a popup no way back to this window
 * (the iPad home-screen app), so if nothing comes back, offer to connect through
 * Google sign-in instead, which needs no popup.
 */
export async function connectGoogle(): Promise<void> {
  if (config.mock) return void toast.show('Google connects on the real server.')
  if (!listening) {
    listening = true
    window.addEventListener('message', onGoogleMessage)
  }
  // Open the window inside the tap (popup blockers), then point it at Google.
  const win = window.open('about:blank', 'actora-google', 'width=520,height=680')
  if (!win) {
    // Going to Google in this tab would strand the answer: it has to come back to a window.
    toast.error('Allow pop-ups to connect Google.', { action: { label: 'Try again', run: () => void connectGoogle() } })
    return
  }
  useGoogle.setState({ busy: true })
  const r = await api<{ url?: string }>('/api/google/calendar/connect').catch(() => null)
  if (!r?.ok || !r.body.url) {
    win.close()
    useGoogle.setState({ busy: false })
    toast.error(r?.status === 503 ? "Google isn't set up on this server yet." : "Couldn't start connecting Google.")
    return
  }
  win.location.href = r.body.url

  endWait?.()
  let answered = false
  const started = Date.now()
  const poll = setInterval(() => {
    if (win.closed || Date.now() - started > 3 * 60_000) void gaveUp()
  }, 1500)
  const answer = () => {
    answered = true
    clearInterval(poll)
    if (endWait === answer) endWait = null
  }
  endWait = answer
  // The popup closed with no answer: maybe it was cancelled, maybe it couldn't reach us.
  const gaveUp = async () => {
    clearInterval(poll)
    // A beat for an answer that is on its way as the popup closes.
    await new Promise((res) => setTimeout(res, 2000))
    if (answered) return // onGoogleMessage has it
    if (endWait === answer) endWait = null
    const s = await refreshGoogle()
    useGoogle.setState({ busy: false })
    if (s?.connected && !s.needs_reauth) return
    toast.show("Google didn't connect.", {
      action: { label: 'Use Google sign-in', run: () => void signInWithGoogle() },
      ms: 9000,
    })
  }
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
