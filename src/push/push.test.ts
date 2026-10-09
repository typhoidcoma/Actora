import { describe, expect, it, vi } from 'vitest'
import { listen, speechProblem, type Recognizer } from '../voice/speech'
import { b64url, subscribeMessage, urlBase64ToUint8Array } from './push'

describe('push encoding', () => {
  it('round-trips a base64url VAPID key', () => {
    const bytes = new Uint8Array([251, 255, 0, 62, 63, 1, 2])
    const key = b64url(bytes.buffer)
    expect(key).not.toMatch(/[+/=]/)
    expect([...urlBase64ToUint8Array(key)]).toEqual([...bytes])
  })

  it('builds a push.subscribe frame with base64url keys', () => {
    const p256dh = new Uint8Array([4, 250, 251]).buffer
    const auth = new Uint8Array([254, 255]).buffer
    const msg = subscribeMessage(
      { endpoint: 'https://push.example/abc', getKey: (k: string) => (k === 'p256dh' ? p256dh : auth) } as never,
      'UA',
    )
    expect(msg).toEqual({
      type: 'push.subscribe',
      endpoint: 'https://push.example/abc',
      p256dh: 'BPr7',
      auth: '_v8',
      userAgent: 'UA',
    })
  })
})

class FakeRecognizer implements Recognizer {
  lang = ''
  interimResults = false
  continuous = true
  onresult: Recognizer['onresult'] = null
  onerror: Recognizer['onerror'] = null
  onend: Recognizer['onend'] = null
  started = false
  start() {
    this.started = true
  }
  stop() {
    this.onend?.()
  }
  abort() {}
  emit(text: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] })
  }
}

describe('speech', () => {
  const micOk = async () => undefined
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it('streams interim text and delivers the whole thing once', async () => {
    const rec = new FakeRecognizer()
    const seen: string[] = []
    let final = ''
    let ends = 0
    listen({ onInterim: (t) => seen.push(t), onFinal: (t) => (final = t), onEnd: () => ends++ }, () => rec, micOk)
    await tick()
    expect(rec.started).toBe(true)
    expect(rec.continuous).toBe(true) // keeps listening across short pauses
    rec.emit('plan my', false)
    rec.emit('plan my day', true)
    rec.onend?.()
    rec.onend?.()
    expect(seen).toEqual(['plan my', 'plan my day'])
    expect(final).toBe('plan my day')
    expect(ends).toBe(1)
  })

  it('finishes on its own after a pause in speech', async () => {
    vi.useFakeTimers()
    const rec = new FakeRecognizer()
    let final = ''
    listen({ onInterim: () => {}, onFinal: (t) => (final = t), onEnd: () => {} }, () => rec, micOk)
    await vi.advanceTimersByTimeAsync(0)
    rec.emit('what is next', true)
    await vi.advanceTimersByTimeAsync(1700)
    expect(final).toBe('what is next')
    vi.useRealTimers()
  })

  it('reports why when nothing usable was heard', async () => {
    const errors: Array<string | undefined> = []
    const on = { onInterim: () => {}, onFinal: () => {}, onEnd: (e?: string) => errors.push(e) }
    listen(on, () => null, micOk)
    listen(
      on,
      () => new FakeRecognizer(),
      async () => 'not-allowed',
    )
    const rec = new FakeRecognizer()
    listen(on, () => rec, micOk)
    await tick()
    rec.onend?.()
    expect(errors).toEqual(['unsupported', 'not-allowed', 'no-speech'])
    expect(speechProblem('not-allowed')).toMatch(/blocked/)
    expect(speechProblem('aborted')).toBeNull()
  })
})
