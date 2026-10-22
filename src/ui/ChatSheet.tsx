import { agentName } from '../stores/agent'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { CopyButton } from './CopyButton'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadEarlier } from '../aelora/client'
import { useAgent, type ChatBubble } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { sideBySide, ui, useUi } from '../stores/ui'
import { clockTime, dayLabel, toolLabel } from './format'
import { Activity } from './Activity'
import { LazyMarkdown as Markdown } from './LazyMarkdown'
import { copyableText, stableMarkdown } from './markdownText'
import { glide, morph, press } from './motion'
import { OptionRail } from './OptionRail'
import { Composer } from './Composer'
import { PendingBody } from './cards/PendingCard'
import { usePendingAction } from '../stores/pending'
import { sheen } from './sheen'
import { runOption } from '../options/run'
import { actOption } from '../options/types'

export function ChatSheet() {
  const open = useUi((s) => s.chatOpen)
  useEffect(() => {
    // Warm the Markdown chunk once the grid has settled.
    const t = setTimeout(() => void import('./Markdown'), 2500)
    return () => clearTimeout(t)
  }, [])
  return <AnimatePresence>{open && <Sheet key="sheet" />}</AnimatePresence>
}

function Sheet() {
  const m = useMetrics()
  // Something open beside it (wide screens): the chat slides to the left half, the same size as that window.
  const paired = useUi(sideBySide) && m.split
  const box = paired ? { ...m.pair.left, radius: m.sheet.radius } : m.sheet
  const drag = useDragControls()
  const [typing, setTyping] = useState(false)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 700) ui.closeChat()
  }

  return (
    <>
      {/* Side by side, nothing is dimmed: both windows are there to be read. */}
      {!paired && (
        <motion.div
          className="fixed inset-0 z-10 bg-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={ui.closeChat}
        />
      )}
      <motion.div
        layoutId="sheet"
        transition={morph}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={onDragEnd}
        {...sheen}
        // Phones read a size down (chat-phone in index.css): more of the conversation fits.
        className={`glass glass-thick fixed z-20 flex flex-col overflow-hidden ${m.compact ? 'chat-phone' : ''}`}
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          borderRadius: box.radius,
        }}
        role="dialog"
        aria-label={`Chat with ${agentName()}`}
      >
        <motion.div
          // Kept at its true size while the sheet slides between centre and the left half
          // (motion counter-scales it), so her words never stretch.
          layout
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.25 } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
        >
          <SheetHeader onPointerDown={(e) => drag.start(e)} />
          <Transcript />
          <PendingStrip />
          <div className="shrink-0 border-t border-line px-3 pt-1 pb-[max(8px,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full max-w-[780px]">
              {/* While typing on a phone the keyboard takes half the screen: give the
                  tiles' room to the conversation until the box loses focus. */}
              {!(m.compact && typing) && <OptionRail contextKey="chat" />}
              <div
                className={m.compact && typing ? '' : 'pt-2'}
                onFocus={(e) => e.target instanceof HTMLInputElement && setTyping(true)}
                onBlur={(e) => e.target instanceof HTMLInputElement && setTyping(false)}
              >
                <Composer />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}

/** In the chat, what's waiting for the user's OK sits right above the answers (Send / Change it / Discard). */
function PendingStrip() {
  const p = usePendingAction()
  if (!p) return null
  return (
    <div className="mx-auto mb-2 w-[calc(100%-24px)] max-w-[780px] shrink-0 rounded-[8px] border border-urgent/30 bg-urgent/6 px-4 py-3">
      <PendingBody p={p} compact />
    </div>
  )
}

function SheetHeader({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  // Phones: the sheet starts at the very top, so the header steps down past the status bar.
  const inset = useMetrics((m) => m.sheet.inset)
  const botName = useAgent((s) => s.botName)
  const phase = useAgent((s) => s.phase)
  const tool = useAgent((s) => s.toolName)
  const doing = useAgent((s) => s.steps.findLast((x) => x.status === 'running')?.doing ?? null)
  const status =
    phase === 'offline'
      ? 'Reconnecting…'
      : phase === 'thinking'
        ? 'Thinking…'
        : phase === 'tool'
          ? `${doing ?? (toolLabel(tool) || 'Working')}…`
          : phase === 'speaking'
            ? 'Speaking'
            : 'Here for you'

  return (
    <header
      onPointerDown={onPointerDown}
      className="relative flex h-[76px] shrink-0 touch-none items-center gap-3 pr-4 pl-[76px]"
      style={inset ? { height: 76 + inset, paddingTop: inset } : undefined}
    >
      <div
        className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-text/15"
        style={inset ? { top: 8 + inset } : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="chat-name display text-[26px] leading-none text-strong">{botName}</div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={status}
            className="mt-1 text-xs text-muted"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {status}
          </motion.div>
        </AnimatePresence>
      </div>
      <motion.button
        whileTap={press}
        onClick={ui.closeChat}
        aria-label="Close chat"
        className="glass-pill grid h-11 w-11 place-items-center rounded-full text-muted"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.button>
    </header>
  )
}

function Transcript() {
  const messages = useAgent((s) => s.messages)
  const streaming = useAgent((s) => s.streaming)
  const awaiting = useAgent((s) => s.awaitingTurn || s.turnId !== null)
  const ref = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  // Pinned to the latest message until the reader scrolls up; growth after a render
  // (lazy markdown, bubbles animating in, the sheet opening) keeps it pinned.
  const stuck = useRef(true)
  const lastTop = useRef(0)
  const [away, setAway] = useState(false)

  const history = useAgent((s) => s.history)
  const newest = messages.at(-1)?.id
  const oldest = messages[0]?.id
  const prev = useRef({ newest, oldest, height: 0 })
  // Something waiting for the user's OK appears above the answers: keep the end in view.
  const waiting = usePendingAction()?.id ?? null

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const p = prev.current
    if (oldest !== p.oldest && newest === p.newest && p.height) {
      // Older page prepended ("Load earlier"): keep the reader's place.
      el.scrollTop += el.scrollHeight - p.height
    } else {
      // Follow her words only if the reader is at (or near) the bottom: scrolling up to
      // re-read mid-answer isn't yanked back. Their own new message always scrolls.
      const mine = messages.at(-1)?.role === 'user' && newest !== p.newest
      if (first.current || stuck.current || mine || waiting) {
        stuck.current = true
        setAway(false)
        el.scrollTo({ top: el.scrollHeight, behavior: first.current || streaming ? 'auto' : 'smooth' })
      }
    }
    first.current = false
    prev.current = { newest, oldest, height: el.scrollHeight }
  }, [messages, streaming, newest, oldest, waiting])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pin = () => {
      if (stuck.current) el.scrollTop = el.scrollHeight
    }
    const ro = new ResizeObserver(pin)
    ro.observe(el)
    if (body.current) ro.observe(body.current)
    // Only the reader scrolling up unpins (scrolls toward the end never do, so our own
    // smooth scroll to the bottom can't); reaching the bottom pins again.
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight
      if (gap < 24) stuck.current = true
      else if (el.scrollTop < lastTop.current - 1) stuck.current = false
      lastTop.current = el.scrollTop
      setAway(!stuck.current && gap > 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  const toLatest = () => {
    const el = ref.current
    if (!el) return
    stuck.current = true
    setAway(false)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} className="scroll-y min-h-0 flex-1 px-5 pt-1 pb-4">
        {history.hasMore && (
          <div className="mb-3 flex justify-center">
            <motion.button
              whileTap={press}
              onClick={loadEarlier}
              className="glass-pill h-10 rounded-[8px] px-4 text-[14px] font-medium text-muted"
            >
              Load earlier
            </motion.button>
          </div>
        )}
        {messages.length === 0 && !awaiting && (
          <p className="display pt-10 text-center text-2xl text-muted">Tap anything below to start.</p>
        )}
        <div ref={body} className="mx-auto flex w-full max-w-[780px] flex-col gap-3">
          {messages.map((b) => (
            <Bubble key={b.id} bubble={b} />
          ))}
          {awaiting && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={glide}
              className="max-w-[88%] self-start"
            >
              {streaming ? (
                <div className="selectable text-text">
                  <Markdown text={stableMarkdown(streaming)} />
                  <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-accent" />
                </div>
              ) : (
                <div className="chat-activity text-[17px] font-semibold text-strong">
                  <Activity compact />
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {away && (
          <motion.button
            key="latest"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={glide}
            whileTap={press}
            onClick={toLatest}
            aria-label="Jump to the latest message"
            className="glass-pill absolute bottom-3 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-strong"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path
                d="M8 3v10M4 9l4 4 4-4"
                stroke="currentColor"
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Latest
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function Bubble({ bubble }: { bubble: ChatBubble }) {
  // A reply that was nothing but her "got it" emoji (now on the user's message) leaves no bubble.
  if (bubble.role === 'assistant' && !bubble.text.trim()) return null
  if (bubble.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={morph}
        className={`chat-user selectable relative max-w-[80%] self-end rounded-[6px] rounded-br-[3px] bg-accent/25 px-4 py-2.5 text-[15px] text-strong ${bubble.react ? 'mb-3' : ''}`}
      >
        {bubble.text}
        <Stamp at={bubble.at} className="mt-0.5 block text-right" />
        {/* The agent's "got it" (message.react): pops onto the corner of what the user said. */}
        <AnimatePresence>
          {bubble.react && (
            <motion.span
              key={bubble.react}
              role="img"
              aria-label={`${agentName()} reacted ${bubble.react}`}
              initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16 }}
              className="glass-pill absolute -bottom-4 -left-3 grid h-8 min-w-8 select-none place-items-center rounded-full px-1.5 text-[17px] leading-none"
            >
              {bubble.react}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }
  if (bubble.role === 'error') {
    return (
      <div className="flex items-center gap-3 self-start text-sm text-urgent">
        {bubble.text}
        <button
          onClick={() => runOption(actOption('Try again', { type: 'retry' }))}
          className="glass-pill h-9 rounded-[6px] px-3 text-[13px] font-semibold text-strong"
        >
          Try again
        </button>
      </div>
    )
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group max-w-[88%] self-start text-text">
      <div className="selectable">
        <Markdown text={bubble.text} />
      </div>
      <div className="flex items-center gap-2">
        {/* Quiet until hovered on desktop; always there (faint) on touch. */}
        <CopyButton
          text={copyableText(bubble.text)}
          className="chat-copy -ml-2 mt-0.5 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
        />
        <Stamp at={bubble.at} className="mt-0.5" />
      </div>
    </motion.div>
  )
}

/** When it was said, small and faint: the time today, the day and time before that. */
function Stamp({ at, className = '' }: { at?: string; className?: string }) {
  if (!at || !Number.isFinite(Date.parse(at))) return null
  const when = new Date(at)
  const today = new Date().toDateString() === when.toDateString()
  return (
    <time dateTime={at} className={`chat-time text-[11px] leading-none text-muted opacity-70 ${className}`}>
      {today ? clockTime(when) : `${dayLabel(when)} · ${clockTime(when)}`}
    </time>
  )
}
