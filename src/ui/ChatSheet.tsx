import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { chat } from '../aelora/client'
import { useAgent, type ChatBubble } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { toolLabel } from './format'
import { stableMarkdown } from './markdownText'
import { glide, morph, press } from './motion'
import { sheen } from './sheen'

// The Markdown stack is the heaviest dependency; load it with the first chat open.
const LazyMarkdown = lazy(() => import('./Markdown'))

function Markdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="md whitespace-pre-wrap">{text}</div>}>
      <LazyMarkdown text={text} />
    </Suspense>
  )
}

const CHIPS: Array<{ label: string; send?: string; prefill?: string }> = [
  { label: 'Plan my day', send: 'Plan my day' },
  { label: "What's next?", send: "What's next on my calendar?" },
  { label: 'Goal check-in', send: 'How are my goals going?' },
  { label: 'Add a task…', prefill: 'Add a task: ' },
]

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
  const drag = useDragControls()
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 700) ui.closeChat()
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-10 bg-ink/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={ui.closeChat}
      />
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
        className="glass glass-thick fixed z-20 flex flex-col overflow-hidden"
        style={{
          left: m.sheet.x,
          top: m.sheet.y,
          width: m.sheet.w,
          height: m.sheet.h,
          borderRadius: m.sheet.radius,
        }}
        role="dialog"
        aria-label="Chat with Wendy"
      >
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.25 } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
        >
          <SheetHeader onPointerDown={(e) => drag.start(e)} />
          <Transcript />
          <Composer />
        </motion.div>
      </motion.div>
    </>
  )
}

function SheetHeader({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  const botName = useAgent((s) => s.botName)
  const phase = useAgent((s) => s.phase)
  const tool = useAgent((s) => s.toolName)
  const status =
    phase === 'offline'
      ? 'Reconnecting…'
      : phase === 'thinking'
        ? 'Thinking…'
        : phase === 'tool'
          ? `${toolLabel(tool) || 'Working'}…`
          : phase === 'speaking'
            ? 'Speaking'
            : 'Here'

  return (
    <header
      onPointerDown={onPointerDown}
      className="relative flex h-[76px] shrink-0 touch-none items-center gap-3 pr-4 pl-[76px]"
    >
      <div className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/15" />
      <div className="min-w-0 flex-1">
        <div className="text-lg leading-tight font-medium text-white">{botName}</div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={status}
            className="num text-xs tracking-wide text-muted"
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
        className="glass-pill grid h-11 w-11 place-items-center rounded-full text-text/80"
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
  const first = useRef(true)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: first.current || streaming ? 'auto' : 'smooth' })
    first.current = false
  }, [messages, streaming])

  return (
    <div ref={ref} className="scroll-y min-h-0 flex-1 px-5 pt-1 pb-4">
      {messages.length === 0 && !awaiting && (
        <p className="pt-10 text-center text-sm text-muted">Tap a suggestion or say anything.</p>
      )}
      <div className="flex flex-col gap-3">
        {messages.slice(-60).map((b) => (
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
              <div className="text-text">
                <Markdown text={stableMarkdown(streaming)} />
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-lime" />
              </div>
            ) : (
              <TypingDots />
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function Bubble({ bubble }: { bubble: ChatBubble }) {
  if (bubble.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={morph}
        className="max-w-[80%] self-end rounded-[20px] rounded-br-md bg-white/10 px-4 py-2.5 text-[15px] text-white"
      >
        {bubble.text}
      </motion.div>
    )
  }
  if (bubble.role === 'error') {
    return <div className="self-start text-sm text-coral/90">{bubble.text}</div>
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-[88%] self-start text-text">
      <Markdown text={bubble.text} />
    </motion.div>
  )
}

function TypingDots() {
  return (
    <div className="flex h-6 items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-lime"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function Composer() {
  const [text, setText] = useState('')
  const busy = useAgent((s) => s.awaitingTurn || s.turnId !== null)
  const offline = useAgent((s) => s.connection !== 'open')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Don't pop the iPad keyboard on open; chips are the primary input.
    if (!matchMedia('(pointer: coarse)').matches) input.current?.focus()
  }, [])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (chat(text)) setText('')
  }

  return (
    <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="scroll-y -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {CHIPS.map((c) => (
          <motion.button
            key={c.label}
            whileTap={press}
            disabled={busy || offline}
            onClick={() => {
              if (c.send) chat(c.send)
              else if (c.prefill) {
                setText(c.prefill)
                input.current?.focus()
              }
            }}
            className="glass-pill h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap text-text/90 transition-opacity disabled:opacity-40"
          >
            {c.label}
          </motion.button>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={offline ? 'Reconnecting…' : 'Message Wendy'}
          enterKeyHint="send"
          className="glass-pill h-12 min-w-0 flex-1 rounded-full px-5 text-white placeholder:text-faint focus:shadow-[inset_0_0_0_1px_rgb(205_224_74/0.45)] focus:outline-none"
        />
        <motion.button
          whileTap={press}
          type="submit"
          disabled={!text.trim() || busy || offline}
          aria-label="Send"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-ink transition-opacity disabled:opacity-30"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4">
            <path
              d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
              stroke="currentColor"
              strokeWidth={1.8}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </form>
    </div>
  )
}
