import { create } from 'zustand'

/**
 * A few quiet UI sounds: SND's Sine kit (Dentsu Lab Tokyo, https://snd.dev/;
 * public/sounds/sine/CREDITS.md). One small audio sprite, fetched and decoded
 * the first time a sound plays, cut up with Web Audio. Callers say what
 * happened (play('reply')), never which file: the moments map to sounds here.
 */

/** Where each sound sits in the sprite (seconds), from public/sounds/sine/audioSprite.json. */
export const SPRITE: Record<string, { start: number; end: number }> = {
  transition_up: { start: 46, end: 46.10063492063492 },
  swipe_01: { start: 20, end: 20.15 },
  toggle_on: { start: 42, end: 42.09972789115646 },
  notification: { start: 8, end: 8.30031746031746 },
  select: { start: 16, end: 16.1 },
  tap_01: { start: 30, end: 30.01 },
  tap_02: { start: 32, end: 32.01 },
  tap_03: { start: 34, end: 34.01004535147392 },
  tap_04: { start: 36, end: 36.01002267573696 },
  tap_05: { start: 38, end: 38.01 },
}

export type Moment = 'reply' | 'sent' | 'done' | 'reminder' | 'message' | 'tap' | 'on'

/** What each moment sounds like, and how loud (0–1). Tune here. */
export const MOMENTS: Record<Moment, { keys: string[]; volume: number }> = {
  // Her reply starting to arrive.
  reply: { keys: ['transition_up'], volume: 0.55 },
  // You sent something (a message to her, or to a friend).
  sent: { keys: ['swipe_01'], volume: 0.45 },
  // A task done, a reminder acknowledged.
  done: { keys: ['toggle_on'], volume: 0.55 },
  // A reminder going off while the app is open.
  reminder: { keys: ['notification'], volume: 0.6 },
  // A friend's message arriving.
  message: { keys: ['select'], volume: 0.55 },
  // Any tap: barely there, a little different each time.
  tap: { keys: ['tap_01', 'tap_02', 'tap_03', 'tap_04', 'tap_05'], volume: 0.35 },
  // Sounds switched on.
  on: { keys: ['toggle_on'], volume: 0.55 },
}

const KEY = 'actora.sound.v1'
const SAME_SOUND_MS = 120

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

/** On by default, per device. */
export const useSound = create<{ on: boolean }>(() => ({ on: saved() }))

export const sound = {
  setOn(on: boolean) {
    useSound.setState({ on })
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      /* private mode: it just won't be remembered */
    }
    if (on) play('on')
  },
}

type Ctx = AudioContext
let ctx: Ctx | null = null
let buffer: AudioBuffer | null = null
let loading: Promise<AudioBuffer | null> | null = null
const lastPlayed = new Map<Moment, number>()

function audioContext(): Ctx | null {
  if (ctx) return ctx
  const AC =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!AC) return null
  try {
    ctx = new AC()
  } catch {
    return null
  }
  return ctx
}

/** Ogg where the browser decodes it (smaller), else AAC (Safari). */
function spriteUrl(): string {
  const ogg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== ''
  return `/sounds/sine/audioSprite.${ogg ? 'ogg' : 'm4a'}`
}

function load(c: Ctx): Promise<AudioBuffer | null> {
  if (buffer) return Promise.resolve(buffer)
  loading ??= fetch(spriteUrl())
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`sprite ${r.status}`))))
    .then((data) => c.decodeAudioData(data))
    .then((b) => (buffer = b))
    .catch(() => {
      loading = null // try again next time
      return null
    })
  return loading
}

/**
 * Play a moment's sound. Silent when sounds are off, the app is in the
 * background (the OS notification speaks for it), or audio isn't available.
 * The same moment won't stack within 120 ms.
 */
export function play(moment: Moment, now = Date.now()): boolean {
  if (!useSound.getState().on) return false
  if (typeof document !== 'undefined' && document.hidden) return false
  if (now - (lastPlayed.get(moment) ?? -Infinity) < SAME_SOUND_MS) return false
  const c = audioContext()
  if (!c) return false
  lastPlayed.set(moment, now)
  const m = MOMENTS[moment]
  const key = m.keys[Math.floor(Math.random() * m.keys.length)]!
  const at = SPRITE[key]!
  // Browsers start audio suspended until a gesture; this resumes it on the first one.
  if (c.state === 'suspended') void c.resume().catch(() => {})
  void load(c).then((b) => {
    if (!b) return
    const src = c.createBufferSource()
    const gain = c.createGain()
    gain.gain.value = m.volume
    src.buffer = b
    src.connect(gain).connect(c.destination)
    src.start(0, at.start, at.end - at.start)
  })
  return true
}

let installed = false

/**
 * Quiet taps on anything pressable, from one listener. A control that makes its
 * own sound (the send buttons) opts out with data-sound="none".
 */
export function installTapSounds(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], [role="switch"], a')
      if (!el || el.closest('[data-sound="none"]')) return
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return
      play('tap')
    },
    { capture: true, passive: true },
  )
}

/** For tests: forget the rate limit. */
export function resetSoundForTests(): void {
  lastPlayed.clear()
}
