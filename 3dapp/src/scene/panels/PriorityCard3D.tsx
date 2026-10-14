import { useRef } from 'react'
import { ringing } from '@actora/aelora/protocol'
import type { Role } from '@actora/color/scheme'
import { runOption } from '@actora/options/run'
import { actOption } from '@actora/options/types'
import type { RankedItem } from '@actora/stores/priority'
import { useEntities } from '@actora/stores/entities'
import { ui } from '@actora/stores/ui'
import { useNow } from '@actora/ui/tiles/data'
import { useStage } from '../../look/layout'
import { drawLines, font, paintGlass, px, textWidth, withAlpha, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const KIND: Record<RankedItem['kind'], { label: string; role: Role }> = {
  task: { label: 'Task', role: 'task' },
  event: { label: 'Event', role: 'event' },
  notification: { label: 'Reminder', role: 'reminder' },
  goal: { label: 'Goal', role: 'goal' },
}

/** Urgency heat, as the 2D cards: calm, mid, urgent. */
const heat = (u: number): Role => (u >= 0.8 ? 'urgent' : u >= 0.5 ? 'mid' : 'calm')

const PAD = 0.075
const BTN_H = 0.085

/**
 * PriorityCard, in the scene: its kind up top (bottom-row cards read upward, the
 * right column is mirrored), the title big, a factual meta line, the kind's
 * colour washing in from the outer corner, and, when a reminder is going off,
 * the alarm: red edge, inner glow, a breathing halo and its "Got it".
 */
export function PriorityCard3D(p: { item: RankedItem; corner: number; present: boolean; onGone: () => void }) {
  const { item, corner } = p
  const look = useLook()
  const reminder = useEntities((s) => (item.kind === 'notification' ? s.notifications[item.id] : undefined))
  const now = useNow(15_000)
  const ring = !!reminder && ringing(reminder, now)
  const kind = KIND[item.kind]
  const stage = useStage()
  const pose = stage.pose(corner)
  const { right, bottom } = pose
  // Phone cards are short: one line of title, a little smaller.
  const tSize = stage.portrait ? 0.11 : 0.128
  const tCap = stage.portrait ? 1 : 2

  const warm = Math.max(0, item.urgency - 0.4) * 1.1
  // At dusk the alarm red sits on a warm, dark card: a lighter alarm pink keeps it legible.
  const label = ring ? (look.day ? look.ink.urgent : '#ffb3c1') : warm > 0.3 ? look.ink[heat(item.urgency)] : look.ink[kind.role]
  const button = item.primary && item.primary.act.type !== 'complete' ? item.primary : null

  // Where the button lands, for hit-testing a tap (canvas fractions).
  const btnBox = useRef({ x0: 0, y0: 0, x1: 0, y1: 0 }).current

  const paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const r = px(stage.card.radius)
    // The same glass as the rail's pills: the room shows through, blurred and tinted.
    paintGlass(ctx, w, h, r, look)
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, r)
    ctx.clip()

    if (ring) {
      const alarm = look.role.urgent
      ctx.save()
      ctx.shadowColor = withAlpha(alarm, 0.85)
      ctx.shadowBlur = px(0.09)
      ctx.lineWidth = px(0.012)
      ctx.strokeStyle = withAlpha(alarm, 0.75)
      ctx.beginPath()
      ctx.roundRect(px(0.006), px(0.006), w - px(0.012), h - px(0.012), r)
      ctx.stroke()
      ctx.restore()
    }

    const pad = px(PAD)
    const align: CanvasTextAlign = right ? 'right' : 'left'
    const x = right ? w - pad : pad

    // Header: kind (with the alarm dot) on one side, the action on the other.
    const kfont = font(700, 0.056)
    // A message a friend left with your assistant arrives as a notification: say what it is.
    const what = reminder?.origin_type === 'assistant' ? 'Message for you' : kind.label
    const kick = ring ? `${what} · now` : what
    const headY = bottom ? h - pad - px(BTN_H) : pad
    const midHead = headY + px(BTN_H) / 2
    let kx = x
    if (ring) {
      ctx.fillStyle = look.role.urgent
      ctx.beginPath()
      ctx.arc(right ? x - px(0.012) : x + px(0.012), midHead, px(0.012), 0, Math.PI * 2)
      ctx.fill()
      kx = right ? x - px(0.04) : x + px(0.04)
    }
    ctx.font = kfont
    ctx.fillStyle = label
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(kick, kx, midHead)

    if (button) {
      const bfont = font(600, 0.036)
      const bw = textWidth(button.label, bfont) + px(0.06)
      const bh = px(BTN_H)
      const bx = right ? pad : w - pad - bw
      ctx.fillStyle = look.day ? 'rgba(255,255,255,0.92)' : look.glassThick
      ctx.strokeStyle = look.line
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(bx, headY, bw, bh, px(0.016))
      ctx.fill()
      ctx.stroke()
      ctx.font = bfont
      ctx.fillStyle = look.strong
      ctx.textAlign = 'center'
      ctx.fillText(button.label, bx + bw / 2, headY + bh / 2)
      Object.assign(btnBox, { x0: bx / w, y0: headY / h, x1: (bx + bw) / w, y1: (headY + bh) / h })
    }

    // Title and meta, centred in the space the header leaves.
    const max = w - pad * 2
    const tfont = font(700, tSize)
    const spacing = `${-px(tSize * 0.045)}px`
    const title = wrap(item.title, tfont, max, tCap, spacing)
    const mfont = font(600, 0.05)
    const meta = item.meta ? wrap(item.meta, mfont, max, 1) : []
    const tlh = px(tSize) * 1.0
    const mlh = px(0.05) * 1.35
    const block = title.length * tlh + (meta.length ? px(0.03) + mlh : 0)
    const top = bottom ? pad : pad + px(BTN_H)
    const room = h - pad - px(BTN_H) - pad
    let y = top + Math.max(0, (room - block) / 2)
    y = drawLines(ctx, title, x, y, tlh, tfont, look.strong, align, spacing)
    if (meta.length) drawLines(ctx, meta, x, y + px(0.03), mlh, mfont, look.muted, align)
  }

  return (
    <Pane
      width={stage.card.w}
      height={stage.card.h}
      radius={stage.card.radius}
      position={pose.position}
      rotation={pose.rotation}
      size={pose.scale}
      paint={paint}
      deps={[item.title, item.meta, item.urgency, ring, corner, button?.label, stage]}
      ring={ring ? look.role.urgent : null}
      present={p.present}
      onGone={p.onGone}
      delay={corner * 0.07}
      onPress={(uv) => {
        const hit = uv.x >= btnBox.x0 && uv.x <= btnBox.x1 && uv.y >= btnBox.y0 && uv.y <= btnBox.y1
        if (hit && button) runOption(actOption(button.label, button.act))
        else ui.open({ kind: item.kind, id: item.id, occurrence: item.occurrence })
      }}
    />
  )
}
