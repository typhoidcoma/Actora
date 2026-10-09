// Speech-to-text for talking to Wendy (tap the orb). Uses the browser's
// built-in recognizer: SpeechRecognition / webkitSpeechRecognition in Chrome,
// Edge and Safari (Chrome and Edge send audio to their online speech service;
// Safari can run on-device). Firefox has none: we say so and offer the keyboard.

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
export interface Recognizer {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognizerCtor = new () => Recognizer

function ctor(): RecognizerCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => ctor() !== null

/** What to tell the user when listening ends without words (null: say nothing). */
export function speechProblem(error: string | undefined): string | null {
  switch (error) {
    case undefined:
    case 'aborted':
      return null
    case 'unsupported':
      return "This browser can't take voice input. Chrome, Edge or Safari can, or type instead."
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked for this site. Allow it from the icon in the address bar, then tap the orb again.'
    case 'audio-capture':
      return 'No microphone found. Check one is connected and not in use by another app.'
    case 'network':
      return "Voice needs an internet connection here (the browser's speech service is online). Check the connection and try again."
    case 'insecure':
      return 'Voice only works over a secure (https) connection.'
    case 'no-speech':
      return "Didn't catch anything. Tap the orb and talk when it's listening."
    default:
      return "Voice input didn't start. Tap the orb to try again."
  }
}

export interface ListenHandlers {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  /** Always called once, after final/error/stop. `error` is set when nothing usable was heard. */
  onEnd: (error?: string) => void
}

/** Finish this long after the last words arrive. */
const SILENCE_MS = 1600
/** Give up if nothing at all is heard for this long. */
const NOTHING_MS = 8000

/**
 * Ask for the microphone up front: the browser shows its prompt, and a blocked
 * or missing mic is caught with a clear reason before the recognizer starts.
 */
async function micReady(): Promise<string | undefined> {
  if (!window.isSecureContext) return 'insecure'
  const md = navigator.mediaDevices
  if (!md?.getUserMedia) return undefined // let the recognizer handle it
  try {
    const stream = await md.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return undefined
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed'
    if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError')
      return 'audio-capture'
    return undefined
  }
}

/**
 * One thing said: listens until the user pauses (or taps to stop), streaming
 * interim text, then delivers the whole thing. Returns a stop function.
 * `make` and `ready` are injectable for tests.
 */
export function listen(
  h: ListenHandlers,
  make?: () => Recognizer | null,
  ready: () => Promise<string | undefined> = micReady,
): () => void {
  const create =
    make ??
    (() => {
      const C = ctor()
      return C ? new C() : null
    })
  let rec: Recognizer | null = null
  let stopped = false
  let ended = false
  let finalText = ''
  let interim = ''
  let silence: ReturnType<typeof setTimeout> | undefined
  let nothing: ReturnType<typeof setTimeout> | undefined

  const end = (error?: string) => {
    if (ended) return
    ended = true
    clearTimeout(silence)
    clearTimeout(nothing)
    if (error && error !== 'no-speech') console.warn(`[voice] ${error}`)
    h.onEnd(error)
  }
  const finish = () => rec?.stop()

  // No recognizer in this browser (Firefox): say so before asking for the mic.
  if (!make && !ctor()) {
    end('unsupported')
    return () => {}
  }

  void (async () => {
    const problem = await ready()
    if (stopped) return end()
    if (problem) return end(problem)
    rec = create()
    if (!rec) return end('unsupported')
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = true
    // Keep listening across short pauses; we decide when they're done.
    rec.continuous = true
    rec.onresult = (e) => {
      interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      h.onInterim((finalText + interim).trim())
      clearTimeout(nothing)
      clearTimeout(silence)
      silence = setTimeout(finish, SILENCE_MS)
    }
    rec.onerror = (e) => {
      // 'no-speech' with words already heard is just the end of the sentence.
      if (e.error === 'no-speech' && (finalText || interim)) return
      end(e.error || 'error')
    }
    rec.onend = () => {
      const text = (finalText || interim).trim()
      if (text) h.onFinal(text)
      end(text ? undefined : 'no-speech')
    }
    nothing = setTimeout(finish, NOTHING_MS)
    try {
      rec.start()
    } catch {
      end('start-failed')
    }
  })()

  return () => {
    stopped = true
    if (rec) rec.stop()
    else end()
  }
}
