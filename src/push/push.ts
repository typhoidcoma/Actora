import { agent } from '../stores/agent'
import { usePush, type PushStatus } from '../stores/push'
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
  // The first hello can beat initPush's registration; look it up rather than skip.
  registration ??= (await navigator.serviceWorker?.getRegistration('/')) ?? null
  const sub = await existingSubscription()
  if (sub) send(subscribeMessage(sub, navigator.userAgent))
}

/**
 * A reminder arrived over the socket while the app is open but not in front
 * (background tab, another window on top). The server skips Web Push whenever a
 * socket is live, so without this nothing would reach the user at all: raise
 * the OS notification ourselves. Clicks route through sw.js like a real push.
 */
export async function notifyInBackground(n: { id: string; title: string; body: string | null }): Promise<void> {
  if (typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus())) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  registration ??= (await navigator.serviceWorker?.getRegistration('/')) ?? null
  if (!registration) return
  await registration.showNotification(n.title, {
    body: n.body ?? '',
    tag: `n:${n.id}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: '/', notificationId: n.id },
  })
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) =>
  !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i])

/**
 * Must run from a tap: prompt, subscribe and register with Aelora. Every way
 * this can fail says why (it used to fail silently and leave the switch Off).
 */
export async function enablePush(): Promise<boolean> {
  const fail = (why: string, status: PushStatus = 'off') => {
    console.warn(`[push] ${why}`)
    usePush.setState({ status })
    agent.showMessage(why)
    return false
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    return fail("This browser can't do push reminders.")
  if (config.mock) {
    // The mock has no push service; exercise the permission path only.
    const perm = await Notification.requestPermission()
    usePush.setState({ status: perm === 'granted' ? 'on' : perm === 'denied' ? 'denied' : 'off' })
    if (perm === 'granted') agent.showMessage('Reminders are on.')
    return perm === 'granted'
  }
  // Ask first, while we're still inside the tap (Safari drops the gesture after awaits).
  const perm = await Notification.requestPermission()
  if (perm === 'denied')
    return fail('Notifications are blocked for this site. Allow them in browser settings.', 'denied')
  if (perm !== 'granted') return fail("Reminders stay off: notifications weren't allowed.")
  try {
    if (!publicKey) publicKey = (await getPublicConfig()).push?.publicKey ?? null
  } catch {
    /* handled below */
  }
  if (!publicKey) return fail('Push is switched off on the server right now.')
  try {
    // Subscribing needs an *active* worker; a fresh registration may still be installing.
    registration = await navigator.serviceWorker.ready
    const key = urlBase64ToUint8Array(publicKey)
    let sub = await registration.pushManager.getSubscription()
    // A subscription made with another server key can never receive our pushes.
    if (sub && !sameKey(sub.options.applicationServerKey, key)) {
      await sub.unsubscribe()
      sub = null
    }
    sub ??= await subscribeHard(key)
    const reply = await ask(subscribeMessage(sub, navigator.userAgent), 'push.subscribed')
    if (!reply) return fail("Couldn't register this device with Wendy. Try again in a moment.")
  } catch (e) {
    console.warn('[push] subscribe failed', e)
    return fail(await explain(e))
  }
  usePush.setState({ status: 'on' })
  agent.showMessage('Reminders are on.')
  return true
}

/**
 * pushManager.subscribe, retried: "Registration failed - push service error" is the
 * browser failing to reach its push service (FCM, WNS…). It's often transient or a
 * stale worker registration, so try again, then again on a freshly registered worker.
 */
async function subscribeHard(key: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  const attempt = () => registration!.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  try {
    return await attempt()
  } catch (e) {
    if (!isPushServiceError(e)) throw e
  }
  await new Promise((r) => setTimeout(r, 1200))
  try {
    return await attempt()
  } catch (e) {
    if (!isPushServiceError(e)) throw e
  }
  // Last go: a clean worker registration (drops any half-made subscription state).
  await registration!.unregister()
  await navigator.serviceWorker.register('/sw.js')
  registration = await navigator.serviceWorker.ready
  return attempt()
}

const isPushServiceError = (e: unknown) =>
  e instanceof DOMException && (e.name === 'AbortError' || /push service/i.test(e.message))

/** What to tell the user when subscribing failed, in words they can act on. */
async function explain(e: unknown): Promise<string> {
  if (!isPushServiceError(e)) return `Couldn't turn on reminders: ${e instanceof Error ? e.message : String(e)}`
  const brave = await (navigator as { brave?: { isBrave?: () => Promise<boolean> } }).brave
    ?.isBrave?.()
    .catch(() => false)
  if (brave)
    return 'Brave blocks push by default. Turn on "Use Google services for push messaging" in brave://settings/privacy, then try again.'
  return "Your browser couldn't reach its push service. A VPN, firewall or blocker can cause this; try again, or another browser."
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
