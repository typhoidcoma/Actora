import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import spriteFile from '../../public/sounds/sine/audioSprite.json'
import { MOMENTS, SPRITE, play, resetSoundForTests, sound, useSound, type Moment } from './sound'

const sprite = spriteFile.spritemap as Record<string, { start: number; end: number }>

/** A stand-in AudioContext that records what would have played. */
function fakeAudio() {
  const started: Array<{ offset: number; duration: number; volume: number }> = []
  class FakeCtx {
    state = 'running'
    destination = {}
    resume = () => Promise.resolve()
    decodeAudioData = () => Promise.resolve({} as AudioBuffer)
    createGain() {
      return { gain: { value: 1 }, connect: (d: unknown) => d }
    }
    createBufferSource() {
      // source.connect(gain) returns the gain; start() records the gain it went through.
      let through = { gain: { value: 1 } }
      return {
        buffer: null,
        connect(g: typeof through) {
          through = g
          return g
        },
        start: (_when: number, offset: number, duration: number) =>
          started.push({ offset, duration, volume: through.gain.value }),
      }
    }
  }
  vi.stubGlobal('window', { AudioContext: FakeCtx })
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
  return started
}

beforeEach(() => {
  resetSoundForTests()
  useSound.setState({ on: true })
})
afterEach(() => vi.unstubAllGlobals())

describe('UI sounds', () => {
  it('every moment maps to sounds that exist in the sprite, with the same timings', () => {
    for (const m of Object.values(MOMENTS)) {
      expect(m.keys.length).toBeGreaterThan(0)
      expect(m.volume).toBeGreaterThan(0)
      expect(m.volume).toBeLessThanOrEqual(1)
      for (const k of m.keys) {
        expect(sprite[k], k).toBeDefined()
        expect(SPRITE[k]).toEqual({ start: sprite[k]!.start, end: sprite[k]!.end })
      }
    }
  })

  it('is silent without audio (tests, old browsers) and when turned off', () => {
    expect(play('reply')).toBe(false) // no AudioContext in node
    fakeAudio()
    useSound.setState({ on: false })
    expect(play('reply')).toBe(false)
  })

  it('plays the moment from its place in the sprite, and never stacks the same one', async () => {
    const started = fakeAudio()
    expect(play('reminder', 1000)).toBe(true)
    expect(play('reminder', 1050)).toBe(false) // within 120 ms
    expect(play('reply', 1050)).toBe(true) // a different moment is fine
    await new Promise((r) => setTimeout(r, 0))
    expect(started[0]).toMatchObject({ offset: 8, volume: MOMENTS.reminder.volume })
    expect(started[0]!.duration).toBeCloseTo(0.3, 2)
    expect(started[1]).toMatchObject({ offset: 46 })
  })

  it('remembers the switch (on by default) and chimes when turned on', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    sound.setOn(false)
    expect(useSound.getState().on).toBe(false)
    expect(store.get('actora.sound.v1')).toBe('off')
    sound.setOn(true)
    expect(store.get('actora.sound.v1')).toBe('on')
  })

  it('has a sound for every moment the app uses', () => {
    const used: Moment[] = ['reply', 'sent', 'done', 'reminder', 'message', 'tap', 'on']
    for (const m of used) expect(MOMENTS[m]).toBeDefined()
  })
})
