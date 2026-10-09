import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../stores/agent'
import { ui, useUi, panelOpen } from '../stores/ui'
import { useMetrics } from '../stores/metrics'
import { Activity } from './Activity'
import { firstSentence, plainText } from './markdownText'

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
  // With the reader open, the reader is her voice: the line steps back rather than echo it.
  // On phones every panel takes the full screen, so the line steps back for all of them.
  const stack = useMetrics((s) => s.stack)
  const quiet = useUi((s) => s.reader || (stack && panelOpen(s)))
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

  // Her full answer lives in box 4; this line carries only the first sentence.
  const content = useMemo((): { key: string; text: string; live?: boolean; kicker?: string; more?: boolean } => {
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
      if (a.streaming) return { key: 'reply-live', text: firstSentence(plainText(a.streaming)), live: true }
      if (a.last?.role === 'assistant') {
        const full = plainText(a.last.text)
        const first = firstSentence(full)
        return { key: `r:${a.last.id}`, text: first, more: full.length > first.length + 2 }
      }
      if (a.last?.role === 'error') return { key: `e:${a.last.id}`, text: a.last.text }
    }
    return { key: 'greeting', text: a.greeting.text, live: a.greeting.streaming }
  }, [a, stalled])

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
    m.compact ? Math.min(26, Math.max(20, m.line.h * 0.11)) : Math.max(18, Math.min(26, m.grid * 0.04)),
  )

  return (
    <motion.div
      className="pointer-events-none fixed z-10 flex flex-col justify-center"
      style={{ left: m.line.x, top: m.line.y, width: m.line.w, height: m.line.h }}
      initial={false}
      animate={{ opacity: hidden ? 0 : 1, y: hidden ? -6 : 0, filter: hidden ? 'blur(4px)' : 'blur(0px)' }}
      // A slow, soft fade when it settles away; quick when the reader takes over.
      transition={{ duration: faded && !quiet ? 1.4 : 0.35, ease: [0.16, 1, 0.3, 1] }}
      aria-live={quiet ? 'off' : 'polite'}
      // inert, not aria-hidden: hiding it also drops focus (e.g. from "Read all", which opens the reader).
      inert={hidden}
    >
      <div
        className="relative max-h-full overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, #000 14px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 14px)',
        }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={displayKey}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 30, filter: { duration: 0.3, ease: 'easeOut' } }}
            // Her words can be selected and copied like any chat message.
            className="display selectable pointer-events-auto px-1 text-center text-strong"
            style={{ fontSize: size, lineHeight: 1.22 }}
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
                onClick={ui.openReader}
                className="pointer-events-auto ml-3 align-middle font-sans text-[14px] font-semibold text-accent underline decoration-accent/40 underline-offset-4"
              >
                Read all
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
