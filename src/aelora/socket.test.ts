import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AeloraSocket, type WebSocketLike } from './socket'

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
