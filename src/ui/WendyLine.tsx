import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { toolLabel } from './format'
import { firstSentence, plainText } from './markdownText'

/**
 * Wendy's voice above the grid: her welcome, her replies to what you tapped,
 * reminders she's passing on. Text sits at the bottom of the box, so as a reply
 * grows, older lines drift up and fade out under the top mask.
 */
export function WendyLine() {
  const m = useMetrics()
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
  const content = useMemo((): { key: string; text: string; live?: boolean; kicker?: string } => {
    if (a.line === 'notice' && a.notice) {
      return {
        key: `n:${a.notice.notificationId}`,
        kicker: 'Reminder',
        text: [a.notice.title, a.notice.body].filter(Boolean).join(' — '),
      }
    }
    if (a.line === 'message' && a.message) return { key: `m:${a.message}`, text: a.message }
    if (a.line === 'reply') {
      if (a.turnBusy && !a.streaming) return { key: 'thinking', text: '' }
      if (a.streaming) return { key: 'reply-live', text: firstSentence(plainText(a.streaming)), live: true }
      if (a.last?.role === 'assistant') {
        return { key: `r:${a.last.id}`, text: firstSentence(plainText(a.last.text)) }
      }
      if (a.last?.role === 'error') return { key: `e:${a.last.id}`, text: a.last.text }
    }
    return { key: 'greeting', text: a.greeting.text, live: a.greeting.streaming }
  }, [a])

  const size = Math.round(
    m.compact ? Math.min(26, Math.max(20, m.line.h * 0.11)) : Math.max(18, Math.min(26, m.grid * 0.04)),
  )

  return (
    <div
      className={`pointer-events-none fixed z-10 flex flex-col ${m.compact ? 'justify-center' : 'justify-end'}`}
      style={{ left: m.line.x, top: m.line.y, width: m.line.w, height: m.line.h }}
      aria-live="polite"
    >
      <div
        className="relative max-h-full overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, #000 14px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 14px)',
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={content.key}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="display px-1 text-center text-strong"
            style={{ fontSize: size, lineHeight: 1.22 }}
          >
            {content.kicker && (
              <span className="mr-2 align-middle font-sans text-[13px] font-medium tracking-wide text-accent not-italic">
                {content.kicker}
              </span>
            )}
            {content.key === 'thinking' ? (
              <Thinking label={a.phase === 'tool' ? toolLabel(a.toolName) : null} />
            ) : content.live ? (
              <Words text={content.text} />
            ) : (
              content.text
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
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

function Thinking({ label }: { label: string | null }) {
  if (label) return <span className="text-muted italic">{label.toLowerCase()}…</span>
  return (
    <span className="inline-flex items-center gap-2 align-middle" aria-label="Wendy is thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}
