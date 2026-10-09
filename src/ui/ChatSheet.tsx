import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAgent, type ChatBubble } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { toolLabel } from './format'
import { LazyMarkdown as Markdown } from './LazyMarkdown'
import { stableMarkdown } from './markdownText'
import { glide, morph, press } from './motion'
import { OptionRail } from './OptionRail'
import { sheen } from './sheen'

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
        className="fixed inset-0 z-10 bg-scrim"
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
          <div className="shrink-0 border-t border-line px-3 pt-1 pb-[max(8px,env(safe-area-inset-bottom))]">
            <OptionRail contextKey="chat" />
          </div>
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
            : 'Here for you'

  return (
    <header
      onPointerDown={onPointerDown}
      className="relative flex h-[76px] shrink-0 touch-none items-center gap-3 pr-4 pl-[76px]"
    >
      <div className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-text/15" />
      <div className="min-w-0 flex-1">
        <div className="display text-[26px] leading-none text-strong">{botName}</div>
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
        <p className="display pt-10 text-center text-2xl text-muted">Tap anything below to start.</p>
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
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-accent" />
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
        className="max-w-[80%] self-end rounded-[20px] rounded-br-md bg-accent/25 px-4 py-2.5 text-[15px] text-strong"
      >
        {bubble.text}
      </motion.div>
    )
  }
  if (bubble.role === 'error') {
    return <div className="self-start text-sm text-urgent">{bubble.text}</div>
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
          className="h-1.5 w-1.5 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}
