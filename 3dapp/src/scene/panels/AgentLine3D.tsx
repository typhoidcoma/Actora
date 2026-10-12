import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { useUi } from '@actora/stores/ui'
import { useCaption } from '../../look/caption'
import { useFocused } from '../../look/focus'
import { useStage } from '../../look/layout'
import { drawLines, font, px, wrap } from '../../look/paint'
import { Pane } from './Pane'

const LH = 1.3
/** The caption box shows this many lines; longer text scrolls up through it, live-caption style. */
const VISIBLE = 2
/** At rest the caption shows from its start, up to this many lines. */
const REST_LINES = 3
/** The canvas is always this many rows tall, so a change of line count never rebuilds it. */
const MAX_ROWS = Math.max(VISIBLE, REST_LINES)
const PAD = 0.02

/** Her voice: bare text (no panel) as a caption over her head, like the 2D AgentLine. */
export function AgentLine3D() {
  const stage = useStage()
  const focused = useFocused()
  const chatOpen = useUi((s) => s.chatOpen)
  const line = stage.line
  const SIZE = line.size
  // In the close-up (a panel open) her words show as a DOM caption instead (Overlay's
  // FocusCaption): depth of field would blur scene text there.
  const caption = useCaption()
  const shown = { current: caption }
  const present = caption.present

  // 600: the 2D line is 500, but type drawn large and scaled down into the scene thins out.
  const f = font(600, SIZE)
  const spacing = `${-px(SIZE * 0.015)}px`
  // While her words stream in: live captions, a two-line window the text scrolls
  // up through (left-aligned, so nothing already there shifts). At rest (a finished
  // reply, a reminder): the whole caption from its start, up to three lines.
  const live = caption.live
  const text = shown.current.text
  const lines = useMemo(() => wrap(text, f, px(line.w), live ? Infinity : REST_LINES, spacing), [text, f, line.w, live, spacing])
  const rows = live ? VISIBLE : Math.max(1, Math.min(REST_LINES, lines.length))
  // The box (and its canvas) is always MAX_ROWS tall; the rows in use sit at the end
  // nearest the anchor, exactly where a box of their own height would put them.
  const height = MAX_ROWS * SIZE * LH + PAD * 2
  const target = live ? Math.max(0, lines.length - VISIBLE) : 0
  const scrolled = useRef(target)
  // The scroll animates outside React: each visible step repaints the canvas directly.
  const repaint = useRef<(() => void) | null>(null)
  const drawn = useRef(target)
  // A new caption (not more of the same one) starts at its own top, unscrolled.
  const first = lines[0] ?? ''
  const lastFirst = useRef(first)
  if (lastFirst.current !== first) {
    lastFirst.current = first
    scrolled.current = target
    drawn.current = target
  }
  useFrame((_, dt) => {
    const cur = scrolled.current
    scrolled.current = Math.abs(cur - target) < 0.004 ? target : cur + (target - cur) * (1 - Math.exp(-dt * 9))
    const step = Math.round(scrolled.current * 100) / 100
    if (step !== drawn.current) {
      drawn.current = step
      repaint.current?.()
    }
  })

  const up = line.grow === 'up'
  // Rows in use start this far down the fixed box (at its bottom when it grows up).
  const top = (up ? MAX_ROWS - rows : 0) * px(SIZE * LH)
  return (
    <Pane
      bare
      // Square: a rounded corner on the invisible box clipped the first letter's descender.
      radius={0}
      width={line.w}
      height={height}
      // Up (over her head): the box's bottom at the anchor, and its left edge just left
      // of her head, so short lines start by her and long ones run into the open space.
      // Down (the phone stack): the box's top at the anchor, full width.
      position={[
        line.position[0] + (up ? line.w * 0.18 * line.scale : 0),
        line.position[1] + (up ? height / 2 : -(height / 2 - SIZE * LH * 0.5)) * line.scale,
        line.position[2],
      ]}
      rotation={line.rotation}
      size={line.scale}
      repaint={repaint}
      paint={(ctx, w) => {
        const lh = px(SIZE * LH)
        const scroll = drawn.current
        // Lines scrolled fully past are not drawn at all; the one sliding out fades
        // as it goes, and the box clips at its top (no half-cut glyphs above it).
        const first = Math.floor(scroll)
        const frac = scroll - first
        ctx.beginPath()
        ctx.rect(0, top + px(PAD) * 0.5, w, rows * lh + px(PAD) * 1.5)
        ctx.clip()
        lines.slice(first).forEach((l, i) => {
          ctx.globalAlpha = i === 0 ? 1 - frac : 1
          drawLines(ctx, [l], 0, top + px(PAD) + (i - frac) * lh, lh, f, shown.current.color, 'left', spacing)
        })
        ctx.globalAlpha = 1
      }}
      deps={[lines, shown.current.color, top, rows]}
      present={present && !focused && !chatOpen}
    />
  )
}
