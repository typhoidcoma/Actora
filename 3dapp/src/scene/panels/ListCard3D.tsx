import type { Role } from '@actora/color/scheme'
import { ui, type TileId } from '@actora/stores/ui'
import { clockTime, countdownParts } from '@actora/ui/format'
import { useAgenda, useGoals, useInbox, useNow, useTasks } from '@actora/ui/tiles/data'
import { useStage } from '../../look/layout'
import { drawLines, font, px, textWidth, withAlpha, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

/** What a list's face says: the 2D tiles' Face (label, big readout, live line, motif). */
interface Face {
  label: string
  value: string
  unit?: string
  line?: string
  /** Dots (filled of total) or a progress bar (0..1). */
  dots?: { total: number; lit: number }
  bar?: number
}

const ROLE_OF: Record<TileId, Role> = { calendar: 'event', tasks: 'task', goals: 'goal', inbox: 'reminder' }

function useCalendarFace(): Face {
  const now = useNow(15_000)
  const { upcoming, current, hydrated } = useAgenda(now)
  if (!hydrated) return { label: 'Calendar', value: '—', line: 'Loading…' }
  if (current) return { label: 'Now', value: clockTime(current.end_time), unit: 'ends', line: current.title }
  const next = upcoming.find((e) => e !== current && Date.parse(e.start_time) > now)
  if (!next) return { label: 'Calendar', value: 'Free', line: 'Nothing scheduled' }
  const { value, unit } = countdownParts(Date.parse(next.start_time) - now)
  return { label: 'Next up', value: String(unit === 'hr' && value % 1 ? value.toFixed(1) : value), unit, line: `${next.title} · ${clockTime(next.start_time)}` }
}

function useTasksFace(): Face {
  const { open, todayTotal, todayDone, hydrated } = useTasks()
  if (!hydrated) return { label: 'Tasks', value: '—', line: 'Loading…' }
  return { label: 'Tasks', value: String(open.length), unit: 'open', line: open[0]?.title ?? 'All clear', dots: todayTotal > 0 ? { total: todayTotal, lit: todayDone } : undefined }
}

function useGoalsFace(): Face {
  const { active, overall, hydrated } = useGoals()
  if (!hydrated) return { label: 'Goals', value: '—', line: 'Loading…' }
  return {
    label: 'Goals',
    value: String(Math.round(overall * 100)),
    unit: '%',
    line: active.length ? `${active.length} active · ${active[0].goal.title}` : 'No active goals',
    bar: active.length ? overall : undefined,
  }
}

function useInboxFace(): Face {
  const now = useNow(30_000)
  const { items, unread, hydrated } = useInbox(now)
  if (!hydrated) return { label: 'Inbox', value: '—', line: 'Loading…' }
  const latest = items.find((n) => !n.read_at) ?? items[0]
  return { label: 'Inbox', value: String(unread), unit: 'new', line: latest?.title ?? 'Nothing new', dots: unread > 0 ? { total: Math.min(unread, 8), lit: Math.min(unread, 8) } : undefined }
}

const FACES: Record<TileId, () => Face> = { calendar: useCalendarFace, tasks: useTasksFace, goals: useGoalsFace, inbox: useInboxFace }

/** A domain summary card: fills a corner when there are fewer than three priorities, as in 2D. Tap for the full list. */
export function ListCard3D(p: { tile: TileId; corner: number; present: boolean; onGone: () => void }) {
  // One hook per tile, fixed for the card's life (the key includes the tile).
  const face = FACES[p.tile]()
  const look = useLook()
  const stage = useStage()
  const pose = stage.pose(p.corner)
  const { right, bottom } = pose
  const accent = look.role[ROLE_OF[p.tile]]
  const ink = look.ink[ROLE_OF[p.tile]]

  const paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, px(stage.card.radius))
    ctx.clip()
    // No fill: the panel's lit body shows through; the face adds the kind's wash and the type.
    const gx = right ? w : 0
    const gy = bottom ? h : 0
    const wash = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.9)
    wash.addColorStop(0, withAlpha(accent, look.day ? 0.22 : 0.2))
    wash.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = 2
    ctx.strokeStyle = look.line
    ctx.beginPath()
    ctx.roundRect(1, 1, w - 2, h - 2, px(stage.card.radius))
    ctx.stroke()

    const pad = px(0.075)
    const x = right ? w - pad : pad
    const align: CanvasTextAlign = right ? 'right' : 'left'
    const vSize = stage.portrait ? 0.13 : 0.19
    const blocks = px(0.056) * 1.4 + px(vSize) * 1.0 + (face.line ? px(0.05) * 1.4 : 0) + (face.dots || face.bar !== undefined ? px(0.04) : 0)
    let y = bottom ? h - pad - blocks : pad

    y = drawLines(ctx, [face.label], x, y, px(0.056) * 1.4, font(700, 0.056), ink, align)
    // The big readout, its unit beside it.
    const vfont = font(700, vSize)
    const vw = textWidth(face.value, vfont, `${-px(vSize * 0.04)}px`)
    drawLines(ctx, [face.value], x, y, px(vSize), vfont, look.strong, align, `${-px(vSize * 0.04)}px`)
    if (face.unit) {
      const ux = right ? x - vw - px(0.02) : x + vw + px(0.02)
      drawLines(ctx, [face.unit], ux, y + px(vSize) * 0.38, px(0.05), font(500, 0.05), look.muted, align)
    }
    y += px(vSize) * 1.0
    if (face.line) y = drawLines(ctx, wrap(face.line, font(500, 0.05), w * 0.88 - pad, 1), x, y, px(0.05) * 1.4, font(500, 0.05), look.text, align)
    if (face.dots) {
      const d = px(0.016)
      for (let i = 0; i < Math.min(14, face.dots.total); i++) {
        const cx = right ? x - d / 2 - i * d * 1.8 : x + d / 2 + i * d * 1.8
        ctx.beginPath()
        ctx.arc(cx, y + px(0.02), d / 2, 0, Math.PI * 2)
        if (i < face.dots.lit) {
          ctx.fillStyle = accent
          ctx.fill()
        } else {
          ctx.strokeStyle = look.line
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }
    } else if (face.bar !== undefined) {
      const bw = px(0.33)
      const bx = right ? x - bw : x
      ctx.fillStyle = withAlpha(look.text, 0.1)
      ctx.beginPath()
      ctx.roundRect(bx, y + px(0.012), bw, px(0.012), px(0.006))
      ctx.fill()
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.roundRect(right ? x - bw * face.bar : bx, y + px(0.012), bw * face.bar, px(0.012), px(0.006))
      ctx.fill()
    }
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
      deps={[face.label, face.value, face.unit, face.line, face.dots?.lit, face.dots?.total, face.bar, p.corner, stage]}
      present={p.present}
      onGone={p.onGone}
      delay={p.corner * 0.07}
      onPress={() => ui.focus(p.tile)}
    />
  )
}
