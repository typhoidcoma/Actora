// Speech-to-text for the mic chip. Uses the browser's built-in recognizer
// (webkitSpeechRecognition on Safari/Chrome); on-device where the OS supports it.

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

export interface ListenHandlers {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  /** Always called once, after final/error/stop. `error` is set when nothing usable was heard. */
  onEnd: (error?: string) => void
}

/**
 * One utterance: starts listening, streams interim text, resolves on the first
 * final result (or silence). Returns a stop function. `make` is injectable for tests.
 */
export function listen(
  h: ListenHandlers,
  make: () => Recognizer | null = () => {
    const C = ctor()
    return C ? new C() : null
  },
): () => void {
  const rec = make()
  if (!rec) {
    h.onEnd('unsupported')
    return () => {}
  }
  let finalText = ''
  let interim = ''
  let ended = false
  const end = (error?: string) => {
    if (ended) return
    ended = true
    h.onEnd(error)
  }

  rec.lang = navigator.language || 'en-US'
  rec.interimResults = true
  rec.continuous = false
  rec.onresult = (e) => {
    interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += r[0].transcript
      else interim += r[0].transcript
    }
    h.onInterim((finalText + interim).trim())
  }
  rec.onerror = (e) => end(e.error || 'error')
  rec.onend = () => {
    const text = (finalText || interim).trim()
    if (text) h.onFinal(text)
    end(text ? undefined : 'no-speech')
  }
  try {
    rec.start()
  } catch {
    end('start-failed')
  }
  return () => rec.stop()
}
