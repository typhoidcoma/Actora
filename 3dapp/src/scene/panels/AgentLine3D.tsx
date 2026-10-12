import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ringing } from '@actora/aelora/protocol'
import { useAgent } from '@actora/stores/agent'
import { useEntities } from '@actora/stores/entities'
import { useNow } from '@actora/ui/tiles/data'
import { plainText } from '@actora/ui/markdownText'
import { useFocused } from '../../look/focus'
import { useStage } from '../../look/layout'
import { drawLines, font, px, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const LH = 1.3
/** The caption box shows this many lines; longer text scrolls up through it, live-caption style. */
const VISIBLE = 2
const PAD = 0.02
/** How long her caption lingers once nothing new is arriving (as the 2D line). */
const FADE_AFTER_MS = 10_000
/** Captions that have already faded this session. */
const fadedAway = new Set<string>()

/** Her first sentence, as the 2D line carries it (the full answer lives in the chat). */
function firstSentence(text: string): string {
  const m = /^[\s\S]*?[.!?…](?=\s|$)/.exec(text)
  return (m ? m[0] : text).trim()
}

/** Her voice: bare text (no panel) as a caption over her head, like the 2D AgentLine. */
export function AgentLine3D() {
  const look = useLook()
  const stage = useStage()
  const focused = useFocused()
  const SIZE = stage.line.size
  const a = useAgent(
    useShallow((s) => ({
      name: s.botName,
      fatal: s.connection === 'fatal',
      line: s.line,
      notice: s.notice,
      message: s.message,
      streaming: s.streaming,
      phase: s.phase,
      step: s.steps[s.steps.length - 1],
      last: s.messages.findLast((m) => m.role === 'assistant')?.text ?? null,
      greeting: s.greeting.text,
      checkin: !!s.greeting.checkin,
      busy: s.awaitingTurn || s.turnId !== null,
    })),
  )
  const reminder = useEntities((s) => (a.notice ? s.notifications[a.notice.notificationId] : undefined))
  const now = useNow(15_000)
  const ring = a.line === 'notice' && !!reminder && ringing(reminder, now)

  let text: string
  let color = look.strong
  if (a.fatal) {
    text = `Can't reach ${a.name}. Reload to try again.`
    color = look.ink.urgent
  } else if (a.line === 'notice' && a.notice) {
    text = a.notice.body ? `${a.notice.title}: ${a.notice.body}` : a.notice.title
    if (ring) color = look.ink.urgent
  } else if (a.line === 'message' && a.message) text = a.message
  else if (a.line === 'reply') {
    if (a.streaming) text = firstSentence(plainText(a.streaming))
    // Working on it: the animated Activity (Overlay) shows over her head instead.
    else if (a.busy) text = ''
    else text = firstSentence(plainText(a.last ?? ''))
  } else text = a.greeting

  // Once her words have sat still for a while, the caption fades off (the 2D rule);
  // anything new brings it straight back. What needs the user (a reminder, a dead
  // connection, a check-in waiting for its answer) and live words stay. A caption
  // that has faded stays gone this session, even when it comes round again.
  const holds = !!a.streaming || a.fatal || a.line === 'notice' || (a.line === 'greeting' && a.checkin)
  const signature = `${a.line}|${text}`
  const [, setTick] = useState(0)
  useEffect(() => {
    if (holds || !text.trim() || fadedAway.has(signature)) return
    const t = setTimeout(() => {
      fadedAway.add(signature)
      setTick((n) => n + 1)
    }, FADE_AFTER_MS)
    return () => clearTimeout(t)
  }, [signature, holds, text])

  // Keep the last words while the line eases out.
  const shown = useRef({ text, color })
  const present = !!text.trim() && (holds || !fadedAway.has(signature))
  if (present) shown.current = { text, color }

  // 600: the 2D line is 500, but type drawn large and scaled down into the scene thins out.
  const f = font(600, SIZE)
  const spacing = `${-px(SIZE * 0.015)}px`
  const lines = wrap(shown.current.text, f, px(stage.line.w), Infinity, spacing)

  // Live captions, not a growing block: the box never resizes (two lines tall),
  // words land left-aligned so nothing already there shifts, and when a third
  // line starts the text glides up and the oldest line fades out at the top.
  const height = VISIBLE * SIZE * LH + PAD * 2
  const target = Math.max(0, lines.length - VISIBLE)
  const scrolled = useRef(target)
  const [scroll, setScroll] = useState(target)
  // A new caption (not more of the same one) starts at its own top, unscrolled.
  const first = lines[0] ?? ''
  const lastFirst = useRef(first)
  if (lastFirst.current !== first) {
    lastFirst.current = first
    scrolled.current = target
  }
  useFrame((_, dt) => {
    const cur = scrolled.current
    if (Math.abs(cur - target) < 0.004) {
      if (cur !== target) {
        scrolled.current = target
        setScroll(target)
      }
      return
    }
    scrolled.current = cur + (target - cur) * (1 - Math.exp(-dt * 9))
    setScroll(Math.round(scrolled.current * 100) / 100)
  })

  const up = stage.line.grow === 'up'
  return (
    <Pane
      bare
      width={stage.line.w}
      height={height}
      // Up (over her head): the box's bottom at the anchor, and its left edge just left
      // of her head, so short lines start by her and long ones run into the open space.
      // Down (the phone stack): the box's top at the anchor, full width.
      position={[
        stage.line.position[0] + (up ? stage.line.w * 0.18 * stage.line.scale : 0),
        stage.line.position[1] + (up ? height / 2 : -(height / 2 - SIZE * LH * 0.5)) * stage.line.scale,
        stage.line.position[2],
      ]}
      rotation={stage.line.rotation}
      size={stage.line.scale}
      paint={(ctx, w, h) => {
        const lh = px(SIZE * LH)
        drawLines(ctx, lines, 0, px(PAD) - scroll * lh, lh, f, shown.current.color, 'left', spacing)
        // The line scrolling away fades out under the top edge.
        if (scroll > 0) {
          const fade = ctx.createLinearGradient(0, 0, 0, lh * 0.9)
          fade.addColorStop(0, `rgba(0,0,0,${Math.min(1, scroll)})`)
          fade.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.globalCompositeOperation = 'destination-out'
          ctx.fillStyle = fade
          ctx.fillRect(0, 0, w, h)
          ctx.globalCompositeOperation = 'source-over'
        }
      }}
      deps={[lines.join('\n'), shown.current.color, scroll]}
      present={present && !focused}
    />
  )
}
