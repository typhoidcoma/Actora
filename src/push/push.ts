import { agent } from '../stores/agent'
import { usePush } from '../stores/push'
import { ask, send } from '../aelora/client'
import { getPublicConfig } from '../aelora/http'
import { config } from '../config'

// Web Push, per Aelora docs/PUSH.md. Push is a doorbell for when the app is
// closed; while it is open, notifications arrive as WS events instead.

/** VAPID public key (base64url) → bytes for pushManager.subscribe. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Subscription keys must be base64url; standard base64 is rejected with bad_request. */
export function b64url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function subscribeMessage(sub: Pick<PushSubscription, 'endpoint' | 'getKey'>, userAgent: string) {
  return {
    type: 'push.subscribe',
    endpoint: sub.endpoint,
    p256dh: b64url(sub.getKey('p256dh')),
    auth: b64url(sub.getKey('auth')),
    userAgent,
  }
}

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports as Mac
const isStandalone = () =>
  (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches

let publicKey: string | null = null
let registration: ServiceWorkerRegistration | null = null

async function existingSubscription(): Promise<PushSubscription | null> {
  return registration ? registration.pushManager.getSubscription() : null
}

/** Register the service worker and work out where we stand. Never prompts. */
export async function initPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return void usePush.setState({ status: 'unsupported' })
  try {
    registration = await navigator.serviceWorker.register('/sw.js')
  } catch {
    return void usePush.setState({ status: 'unsupported' })
  }
  navigator.serviceWorker.addEventListener('message', onWorkerMessage)

  if (config.mock) {
    publicKey = null
  } else {
    try {
      publicKey = (await getPublicConfig()).push?.publicKey ?? null
    } catch {
      publicKey = null
    }
  }
  if (!config.mock && !publicKey) return void usePush.setState({ status: 'unsupported' })
  if (isIOS() && !isStandalone()) return void usePush.setState({ status: 'needs-install' })
  if (!('PushManager' in window) || !('Notification' in window)) return void usePush.setState({ status: 'unsupported' })
  if (Notification.permission === 'denied') return void usePush.setState({ status: 'denied' })
  const sub = await existingSubscription()
  usePush.setState({ status: sub && Notification.permission === 'granted' ? 'on' : 'off' })
}

/** Called on every `hello`: iOS silently drops subscriptions, so re-register each connect. */
export async function resubscribe(): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const sub = await existingSubscription()
  if (sub) send(subscribeMessage(sub, navigator.userAgent))
}

/** Must run from a tap: fetch the key first, then prompt, then subscribe and register. */
export async function enablePush(): Promise<boolean> {
  if (!registration) return false
  if (config.mock) {
    // The mock has no push service; exercise the permission path only.
    const perm = await Notification.requestPermission()
    usePush.setState({ status: perm === 'granted' ? 'on' : perm === 'denied' ? 'denied' : 'off' })
    if (perm === 'granted') agent.showMessage('Reminders are on.')
    return perm === 'granted'
  }
  if (!publicKey) return false
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    usePush.setState({ status: perm === 'denied' ? 'denied' : 'off' })
    return false
  }
  let sub = await registration.pushManager.getSubscription()
  sub ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  const reply = await ask(subscribeMessage(sub, navigator.userAgent), 'push.subscribed')
  const ok = reply !== null
  usePush.setState({ status: ok ? 'on' : 'off' })
  agent.showMessage(ok ? 'Reminders are on.' : "Couldn't turn on reminders. Try again later.")
  return ok
}

export async function disablePush(): Promise<void> {
  const sub = await existingSubscription()
  if (sub) {
    await sub.unsubscribe()
    await ask({ type: 'push.unsubscribe', endpoint: sub.endpoint }, 'push.unsubscribed')
  }
  usePush.setState({ status: 'off' })
  agent.showMessage('Reminders are off. They still show here while the app is open.')
}

/** push.test: sends a fixed payload to this user's devices, bypassing all gates. */
export async function testPush(): Promise<void> {
  const r = await ask<{ type: string; devices?: number; sent?: number; failed?: number }>(
    { type: 'push.test' },
    'push.tested',
  )
  if (!r) agent.showMessage("Test reminder didn't go through — push may be off on the server.")
  else
    agent.showMessage(
      r.devices
        ? `Sent a test to ${r.sent}/${r.devices} device${r.devices === 1 ? '' : 's'}${r.failed ? ` (${r.failed} failed)` : ''}.`
        : 'No devices registered yet. Turn on reminders first.',
    )
}

export const INSTALL_HELP =
  'To get reminders on iPad or iPhone: tap Share, then "Add to Home Screen", and open Actora from there.'

// Lock-screen tap while the app is open (service worker postMessage), or a cold
// start with ?notification=<id>. The handler is set by the app once stores exist.
let onNotificationOpen: ((id: string) => void) | null = null
let pendingOpen: string | null =
  typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('notification')

export function setNotificationOpener(fn: (id: string) => void): () => void {
  onNotificationOpen = fn
  if (pendingOpen) {
    const id = pendingOpen
    pendingOpen = null
    const url = new URL(location.href)
    url.searchParams.delete('notification')
    history.replaceState(null, '', url)
    fn(id)
  }
  return () => {
    if (onNotificationOpen === fn) onNotificationOpen = null
  }
}

function onWorkerMessage(e: MessageEvent) {
  const data = e.data as { type?: string; notificationId?: string } | null
  if (data?.type === 'notification-click' && data.notificationId) {
    if (onNotificationOpen) onNotificationOpen(data.notificationId)
    else pendingOpen = data.notificationId
  }
}
