import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../stores/agent'
import { ui, useUi, panelOpen } from '../stores/ui'
import { useMetrics } from '../stores/metrics'
import { Activity } from './Activity'
import { firstSentence, hasMore, liveTail, plainText } from './markdownText'

/**
 * Wendy's voice above the grid: her welcome, her replies to what you tapped,
 * reminders she's passing on. Text sits at the bottom of the box, so as a reply
 * grows, older lines drift up and fade out under the top mask.
 */
/** How long her line lingers once nothing new is arriving. */
const FADE_AFTER_MS = 10_000

// Lines already shown (and already faded) this session. Coming back home
// switches the line back to her greeting; it must not retype like a new
// message, and once it has faded away it stays away until something new comes.
const revealed = new Set<string>()
const fadedAway = new Set<string>()

export function WendyLine() {
  const m = useMetrics()
  const stalled = useStalled()
  // On phones every panel takes the full screen, so the line steps back while one is open.
  const stack = useMetrics((s) => s.stack)
  const quiet = useUi((s) => stack && panelOpen(s))
  const a = useAgent(
    useShallow((s) => ({
      line: s.line,
      greeting: s.greeting,
      streaming: s.streaming,
      turnBusy: s.awaitingTurn || s.turnId !== null,
      phase: s.phase,
      toolName: s.toolName,
      last: s.messages.at(-1),
      notice: s.notice,
      message: s.message,
    })),
  )

  // Her full answer lives in the chat; this line carries only the first sentence.
  const content = useMemo((): {
    key: string
    text: string
    live?: boolean
    kicker?: string
    more?: boolean
  } => {
    // Without the top bar this line is the only place a dead connection can show.
    if (stalled === 'fatal')
      return { key: 'conn-fatal', kicker: 'Offline', text: "Can't reach Wendy. Reload to try again." }
    if (stalled) return { key: 'conn-stalled', kicker: 'Connecting', text: "Can't reach Wendy yet. Still trying…" }
    if (a.line === 'notice' && a.notice) {
      return {
        key: `n:${a.notice.notificationId}`,
        kicker: 'Reminder',
        text: [a.notice.title, a.notice.body].filter(Boolean).join(' — '),
      }
    }
    // App notes (reminders switched on, saved to tasks…) are labelled as the app's, not put in Wendy's mouth.
    if (a.line === 'message' && a.message) return { key: `m:${a.message}`, kicker: 'Actora', text: a.message }
    if (a.line === 'reply') {
      if (a.turnBusy && !a.streaming) return { key: 'thinking', text: '' }
      // Still typing (the chat closed on her): follow her latest words, with a way back into the chat.
      if (a.streaming) {
        const full = plainText(a.streaming)
        const text = liveTail(full, stack ? 100 : 150)
        return { key: 'reply-live', text, live: true, more: full.length > text.length }
      }
      if (a.last?.role === 'assistant') {
        return {
          key: `r:${a.last.id}`,
          text: firstSentence(plainText(a.last.text)),
          more: hasMore(a.last.text),
        }
      }
      if (a.last?.role === 'error') return { key: `e:${a.last.id}`, text: a.last.text }
    }
    return { key: 'greeting', text: a.greeting.text, live: a.greeting.streaming }
  }, [a, stalled, stack])

  // Settled text gets a fresh word-by-word reveal whenever it changes (page
  // load, cached → new greeting); text that just finished streaming keeps its
  // key so it isn't revealed a second time.
  const [streamed, setStreamed] = useState('')
  if (content.live && content.text !== streamed) setStreamed(content.text)
  const displayKey = content.live || content.text === streamed ? content.key : `${content.key}:${content.text}`

  // Once her words have sat still for a while, the line fades off and leaves the
  // grid clean; anything new brings it straight back. Things that need the user
  // (a reminder, a dead connection) and live work (thinking, streaming) stay.
  const holds = content.live || content.key === 'thinking' || !!stalled || content.kicker === 'Reminder'
  const signature = `${content.key}|${content.text}`
  // Whether it's new is decided once, when the text first appears, so a re-render
  // mid-reveal can't cut the animation short.
  const [settled, setSettled] = useState({
    signature,
    faded: fadedAway.has(signature),
    fresh: !revealed.has(signature),
  })
  if (settled.signature !== signature)
    setSettled({ signature, faded: fadedAway.has(signature), fresh: !revealed.has(signature) })
  useEffect(() => {
    if (holds || !content.text) return
    const t = setTimeout(() => {
      fadedAway.add(signature)
      setSettled((p) => (p.signature === signature ? { ...p, faded: true } : p))
    }, FADE_AFTER_MS)
    return () => clearTimeout(t)
  }, [signature, holds, content.text])
  // Seen in full once (revealed, or streamed in live): from now on it just sits there.
  const seenBefore = settled.signature === signature && !settled.fresh
  useEffect(() => {
    if (content.text && !holds) revealed.add(signature)
  }, [signature, holds, content.text])
  const faded = settled.faded && settled.signature === signature && !holds
  const hidden = quiet || faded

  const size = Math.round(
    // Stacked phones: three lines fill the band, so a short band gets smaller words.
    m.stack
      ? Math.min(21, Math.max(17, m.line.h / 3.7))
      : m.compact
        ? Math.min(26, Math.max(20, m.line.h * 0.11))
        : Math.max(18, Math.min(26, m.grid * 0.04)),
  )
  // Long lines step their size down until they fit the band (measured before
  // paint), never below a readable minimum; past that, it ends in an ellipsis on
  // the last line that fits (and replies keep their "Read all").
  // Measured on a hidden copy of the text, so the visible line's styles (which
  // React owns) are never touched; while streaming, at most every ~150 ms.
  const measureRef = useRef<HTMLDivElement>(null)
  const lastMeasure = useRef(0)
  const [fit, setFit] = useState(size)
  const [clamp, setClamp] = useState<number | null>(null)
  const measured = `${content.kicker ? `${content.kicker}  ` : ''}${content.text}${content.more ? (content.live ? '   Open chat' : '   Read all') : ''}`
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const now = performance.now()
    if (content.live && now - lastMeasure.current < 150) return
    lastMeasure.current = now
    const room = m.line.h - 6
    const min = m.compact ? 14 : 16
    let fs = size
    el.textContent = measured
    el.style.fontSize = `${fs}px`
    while (fs > min && el.scrollHeight > room) el.style.fontSize = `${--fs}px`
    setFit(fs)
    const over = el.scrollHeight > room
    setClamp(over ? Math.max(2, Math.floor(room / (fs * 1.22))) : null)
    // A reply cut off here is a reply for the chat (autoChat opens it).
    const reply = content.key === 'reply-live' || content.key.startsWith('r:')
    if (useUi.getState().lineOverflow !== (over && reply)) useUi.setState({ lineOverflow: over && reply })
  }, [size, measured, content.live, content.key, m.line.h, m.line.w, m.compact])

  return (
    <motion.div
      className="pointer-events-none fixed z-10 flex flex-col justify-center"
      style={{ left: m.line.x, top: m.line.y, width: m.line.w, height: m.line.h }}
      initial={false}
      animate={{ opacity: hidden ? 0 : 1, y: hidden ? -6 : 0, filter: hidden ? 'blur(4px)' : 'blur(0px)' }}
      // A slow, soft fade when it settles away; quick when a panel takes over.
      transition={{ duration: faded && !quiet ? 1.4 : 0.35, ease: [0.16, 1, 0.3, 1] }}
      aria-live={quiet ? 'off' : 'polite'}
      // inert, not aria-hidden: hiding it also drops focus (e.g. from "Read all", which opens the chat).
      inert={hidden}
    >
      {/* The measuring copy: same width, font and padding as the line, never seen. */}
      <div
        ref={measureRef}
        aria-hidden
        className="display invisible absolute inset-x-0 top-0 px-1 text-center"
        style={{ lineHeight: 1.22 }}
      />
      <div className="relative max-h-full overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={displayKey}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 30, filter: { duration: 0.3, ease: 'easeOut' } }}
            // Her words can be selected and copied like any chat message.
            className="display selectable pointer-events-auto px-1 text-center text-strong"
            style={{
              fontSize: fit,
              lineHeight: 1.22,
              ...(clamp
                ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: clamp, overflow: 'hidden' }
                : {}),
            }}
          >
            {content.kicker && (
              <span className="mr-2 align-middle font-sans text-[13px] font-medium tracking-wide text-accent not-italic">
                {content.kicker}
              </span>
            )}
            {content.key === 'thinking' ? (
              <Activity />
            ) : content.live ? (
              <Words text={content.text} />
            ) : seenBefore ? (
              content.text
            ) : (
              <Reveal text={content.text} />
            )}
            {content.more && (
              <button
                onClick={ui.openChat}
                className="pointer-events-auto ml-3 align-middle font-sans text-[14px] font-semibold text-accent underline decoration-accent/40 underline-offset-4"
              >
                {content.live ? 'Open chat' : 'Read all'}
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Settled text arriving (page load, a new reply): words rise in one after another. */
function Reveal({ text }: { text: string }) {
  const parts = text.split(/(\s+)/)
  let word = 0
  return (
    <>
      {parts.map((w, i) => {
        if (/^\s+$/.test(w)) return w
        const delay = Math.min(word++ * 0.045, 1.2)
        return (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
          >
            {w}
          </motion.span>
        )
      })}
    </>
  )
}

/** Streaming text with a soft per-word fade-in. */
function Words({ text }: { text: string }) {
  const words = text.split(/(\s+)/)
  return (
    <>
      {words.map((w, i) => (
        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
          {w}
        </motion.span>
      ))}
    </>
  )
}

/** Not connected for a few seconds (or given up): Wendy can't hear taps, so say so. */
function useStalled(): false | 'stalled' | 'fatal' {
  const connection = useAgent((s) => s.connection)
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (connection === 'open') return
    const t = setTimeout(() => setLate(true), 6000)
    return () => {
      clearTimeout(t)
      setLate(false)
    }
  }, [connection])
  if (connection === 'fatal') return 'fatal'
  return connection !== 'open' && late ? 'stalled' : false
}
