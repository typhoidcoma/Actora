import { describe, expect, it } from 'vitest'
import { listen, type Recognizer } from '../voice/speech'
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
  it('streams interim text and delivers the final transcript once', () => {
    const rec = new FakeRecognizer()
    const seen: string[] = []
    let final = ''
    let ends = 0
    listen({ onInterim: (t) => seen.push(t), onFinal: (t) => (final = t), onEnd: () => ends++ }, () => rec)
    expect(rec.started).toBe(true)
    rec.emit('plan my', false)
    rec.emit('plan my day', true)
    rec.onend?.()
    rec.onend?.()
    expect(seen).toEqual(['plan my', 'plan my day'])
    expect(final).toBe('plan my day')
    expect(ends).toBe(1)
  })

  it('reports unsupported and no-speech', () => {
    const errors: Array<string | undefined> = []
    listen({ onInterim: () => {}, onFinal: () => {}, onEnd: (e) => errors.push(e) }, () => null)
    const rec = new FakeRecognizer()
    listen({ onInterim: () => {}, onFinal: () => {}, onEnd: (e) => errors.push(e) }, () => rec)
    rec.onend?.()
    expect(errors).toEqual(['unsupported', 'no-speech'])
  })
})
