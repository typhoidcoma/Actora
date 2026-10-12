import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { useUi } from '@actora/stores/ui'
import { useCaption } from '../../look/caption'
import { useFocused } from '../../look/focus'
import { useStage } from '../../look/layout'
import { drawLines, font, px, wrap } from '../../look/paint'
import { Pane } from './Pane'

const LH = 1.3
/** The caption box shows this many lines; longer text scrolls up through it, live-caption style. */
const VISIBLE = 2
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
  const lines = wrap(shown.current.text, f, px(line.w), Infinity, spacing)

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

  const up = line.grow === 'up'
  return (
    <Pane
      bare
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
      present={present && !focused && !chatOpen}
    />
  )
}
