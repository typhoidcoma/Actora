import { backoffMs, closeAction } from './closePolicy'
import type { ClientMessage, ServerFrame } from './protocol'

/** The subset of the browser WebSocket we rely on, so the mock can stand in for it. */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: Event) => unknown) | null
  onmessage: ((ev: MessageEvent) => unknown) | null
  onclose: ((ev: CloseEvent) => unknown) | null
  onerror: ((ev: Event) => unknown) | null
}

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'fatal' | 'closed'

export interface FrameBus {
  send(msg: ClientMessage): boolean
  subscribe(fn: (frame: ServerFrame) => void): () => void
}

interface Options {
  /** Current access token, or null when signed out. Called on every (re)connect. */
  getToken: () => Promise<string | null>
  /** Opens the underlying socket for a token. */
  open: (token: string) => WebSocketLike
  /** Called once after a 1008 close so the session can be refreshed before retrying. */
  onReauth?: () => Promise<void>
}

const OPEN = 1
const CONNECT_TIMEOUT_MS = 25_000 // Cloud Run cold starts are slow
const PING_EVERY_MS = 25_000
const STALE_AFTER_MS = 60_000

/**
 * One Aelora connection with the reconnect policy from FRONTEND.md:
 * backoff + jitter, fatal on 4001, reauth on 1008, slow retry on 1013,
 * app-level ping to catch sockets that died while the iPad slept.
 * The connection counts as "open" only once `hello` arrives.
 */
export class AeloraSocket implements FrameBus {
  status: SocketStatus = 'idle'
  fatalReason: string | null = null

  private ws: WebSocketLike | null = null
  private wanted = false
  private attempt = 0
  private reauthTried = false
  private lastFrameAt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private connectTimer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private readonly frameListeners = new Set<(f: ServerFrame) => void>()
  private readonly statusListeners = new Set<(s: SocketStatus) => void>()
  private readonly opts: Options

  constructor(opts: Options) {
    this.opts = opts
  }

  start(): void {
    if (this.wanted) return
    this.wanted = true
    this.fatalReason = null
    this.attempt = 0
    document.addEventListener('visibilitychange', this.wake)
    window.addEventListener('online', this.wake)
    void this.open()
  }

  stop(): void {
    this.wanted = false
    document.removeEventListener('visibilitychange', this.wake)
    window.removeEventListener('online', this.wake)
    this.teardown()
    this.setStatus('closed')
  }

  /** Drop the current socket and connect again with a fresh token (e.g. after TOKEN_REFRESHED). */
  reconnect(): void {
    if (!this.wanted) return
    this.attempt = 0
    this.teardown()
    void this.open()
  }

  send(msg: ClientMessage): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== OPEN) return false
    ws.send(JSON.stringify(msg))
    return true
  }

  subscribe(fn: (frame: ServerFrame) => void): () => void {
    this.frameListeners.add(fn)
    return () => this.frameListeners.delete(fn)
  }

  onStatus(fn: (s: SocketStatus) => void): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  private wake = () => {
    if (document.visibilityState !== 'visible' || !this.wanted) return
    if (this.status === 'reconnecting' && !this.ws) {
      clearTimeout(this.retryTimer)
      void this.open()
    } else if (this.status === 'open' && Date.now() - this.lastFrameAt > STALE_AFTER_MS) {
      this.reconnect()
    }
  }

  private async open(): Promise<void> {
    clearTimeout(this.retryTimer)
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')

    let token: string | null = null
    try {
      token = await this.opts.getToken()
    } catch {
      token = null
    }
    if (!this.wanted || this.ws) return
    if (!token) {
      console.warn('[aelora] no session token')
      this.fail('signed-out')
      return
    }

    const ws = this.opts.open(token)
    this.ws = ws

    this.connectTimer = setTimeout(() => {
      if (this.ws === ws && this.status !== 'open') {
        ws.onclose = null
        ws.close()
        this.handleClose(ws, 0)
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return
      this.lastFrameAt = Date.now()
      let frame: ServerFrame
      try {
        frame = JSON.parse(String(ev.data)) as ServerFrame
      } catch {
        return
      }
      if (!frame || typeof frame.type !== 'string') return
      if (frame.type === 'hello') {
        clearTimeout(this.connectTimer)
        this.attempt = 0
        this.reauthTried = false
        this.startPing()
        this.setStatus('open')
      }
      for (const fn of this.frameListeners) fn(frame)
    }
    ws.onclose = (ev) => this.handleClose(ws, ev.code)
    ws.onerror = () => {
      /* onclose follows with the real code */
    }
  }

  private handleClose(ws: WebSocketLike, code: number): void {
    if (ws !== this.ws) return
    console.warn(`[aelora] socket closed (code ${code || 'timeout'}), attempt ${this.attempt}`)
    this.ws = null
    clearTimeout(this.connectTimer)
    clearInterval(this.pingTimer)
    if (!this.wanted) return

    const action = closeAction(code)
    if (action === 'fatal') {
      this.fail('kicked')
      return
    }
    if (action === 'reauth') {
      if (this.reauthTried) {
        this.fail('unauthorized')
        return
      }
      this.reauthTried = true
      this.setStatus('reconnecting')
      void (this.opts.onReauth?.() ?? Promise.resolve()).finally(() => {
        if (this.wanted && !this.ws) void this.open()
      })
      return
    }
    const delay = backoffMs(this.attempt++, action === 'retry-slow')
    this.setStatus('reconnecting')
    this.retryTimer = setTimeout(() => void this.open(), delay)
  }

  private startPing(): void {
    clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastFrameAt > STALE_AFTER_MS) {
        this.reconnect()
        return
      }
      this.send({ type: 'ping' })
    }, PING_EVERY_MS)
  }

  private teardown(): void {
    clearTimeout(this.retryTimer)
    clearTimeout(this.connectTimer)
    clearInterval(this.pingTimer)
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.onmessage = null
      ws.close(1000)
    }
  }

  private fail(reason: string): void {
    console.warn(`[aelora] giving up: ${reason}`)
    this.wanted = false
    this.fatalReason = reason
    this.teardown()
    this.setStatus('fatal')
  }

  private setStatus(s: SocketStatus): void {
    if (this.status === s) return
    this.status = s
    for (const fn of this.statusListeners) fn(s)
  }
}
