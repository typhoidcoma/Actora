import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AeloraSocket, tokenExpiry, type WebSocketLike } from './socket'

// The browser bits the socket listens to (tests run in node).
const listeners = new Map<string, () => void>()
beforeEach(() => {
  listeners.clear()
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (k: string, fn: () => void) => listeners.set(k, fn),
    removeEventListener: () => {},
  })
  vi.stubGlobal('window', { addEventListener: (k: string, fn: () => void) => listeners.set(k, fn), removeEventListener: () => {} })
})
afterEach(() => vi.unstubAllGlobals())

class FakeWs implements WebSocketLike {
  readyState = 0
  sent: string[] = []
  onopen: WebSocketLike['onopen'] = null
  onmessage: WebSocketLike['onmessage'] = null
  onclose: WebSocketLike['onclose'] = null
  onerror: WebSocketLike['onerror'] = null
  send(d: string) {
    this.sent.push(d)
  }
  close() {}
  openNow() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('the socket', () => {
  it('sends the token as its first frame, never in the address', async () => {
    const made: Array<{ ws: FakeWs; token: string }> = []
    const sock = new AeloraSocket({
      getToken: async () => 'jwt-1',
      open: (token) => {
        const ws = new FakeWs()
        made.push({ ws, token })
        return ws
      },
    })
    sock.start()
    await tick()
    made[0].ws.openNow()
    expect(JSON.parse(made[0].ws.sent[0])).toEqual({ type: 'auth', token: 'jwt-1' })
    sock.stop()
  })

  it("waking mid re-auth waits for the fresh token instead of retrying the old one", async () => {
    let token = 'old'
    let finishReauth = () => {}
    const opened: string[] = []
    const sock = new AeloraSocket({
      getToken: async () => token,
      onReauth: () =>
        new Promise<void>((r) => {
          finishReauth = () => {
            token = 'fresh'
            r()
          }
        }),
      open: (t) => {
        opened.push(t)
        return new FakeWs()
      },
    })
    sock.start()
    await tick()
    // Refused: the server closes with 1008.
    const first = (sock as unknown as { ws: FakeWs }).ws
    first.onclose?.({ code: 1008 } as CloseEvent)
    listeners.get('visibilitychange')?.() // the phone comes back mid re-auth
    await tick()
    expect(opened).toEqual(['old'])
    finishReauth()
    await tick()
    await tick()
    expect(opened).toEqual(['old', 'fresh'])
    sock.stop()
  })
})

// A sign-in token that runs out at `exp` (ms).
const jwt = (exp: number, n = 'a') =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(exp / 1000), n })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`

describe('the token running out', () => {
  afterEach(() => vi.useRealTimers())

  it('reads when a token expires, and shrugs at one it cannot read', () => {
    expect(tokenExpiry(jwt(1_800_000_000_000))).toBe(1_800_000_000_000)
    expect(tokenExpiry('mock')).toBeNull()
    expect(tokenExpiry('a.!!!.b')).toBeNull()
  })

  it('swaps to a fresh token before the old one runs out, waiting for her reply to finish', async () => {
    vi.useFakeTimers()
    const t0 = Date.now()
    let token = jwt(t0 + 60 * 60_000, 'old')
    let busy = true
    const opened: string[] = []
    const sockets: FakeWs[] = []
    const sock = new AeloraSocket({
      getToken: async () => token,
      onReauth: async () => void (token = jwt(Date.now() + 60 * 60_000, 'fresh')),
      busy: () => busy,
      open: (t) => {
        opened.push(t)
        const ws = new FakeWs()
        sockets.push(ws)
        return ws
      },
    })
    sock.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].openNow()
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'hello', userId: 'u' }) } as MessageEvent)
    // Pings keep it alive; nothing happens for most of the hour.
    const live = async (ms: number) => {
      for (let t = 0; t < ms; t += 20_000) {
        await vi.advanceTimersByTimeAsync(20_000)
        sockets[0].onmessage?.({ data: '{"type":"pong"}' } as MessageEvent)
      }
    }
    await live(57 * 60_000)
    expect(opened).toHaveLength(1)
    // Two minutes before it runs out: a fresh token, but she's mid-reply, so the swap waits.
    await live(60_000)
    expect(opened).toHaveLength(1)
    busy = false
    await vi.advanceTimersByTimeAsync(10_000)
    expect(opened).toHaveLength(2)
    expect(tokenExpiry(opened[1])! - tokenExpiry(opened[0])!).toBeGreaterThan(50 * 60_000)
    sock.stop()
  })
})
