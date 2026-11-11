import type { ChatsCardData } from '@actora/stores/social'
import { ui } from '@actora/stores/ui'
import { ago } from '@actora/ui/format'
import { useNow } from '@actora/ui/tiles/data'
import { useStage } from '../../look/layout'
import { font, paintGlass, px, textWidth, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const PAD = 0.075
const HEAD = 0.085

/**
 * The 2D ChatsCard, in the scene: "Chats" and how many are new up top, then
 * the conversations, waiting ones first, each with its unread count or how long
 * ago. Never what was said. The card is one tap target here: it opens the
 * newest waiting chat, else People.
 */
export function ChatsCard3D(p: { card: ChatsCardData; corner: number; present: boolean; onGone: () => void }) {
  const { card, corner } = p
  const look = useLook()
  const stage = useStage()
  const now = useNow(30_000)
  const pose = stage.pose(corner)
  const { right } = pose
  const urgency = card.score / 100
  const label = !card.unread ? look.muted : urgency >= 0.8 ? look.ink.urgent : urgency >= 0.5 ? look.ink.mid : look.ink.calm
  const status = card.unread ? `${card.unread} new` : card.rows.length ? 'All caught up' : ''
  // The rows as plain strings, so a repaint only happens when what shows changes.
  const rows = card.rows.map((r) => ({ name: r.name, unread: r.unread, when: r.at ? ago(r.at, now) : '' }))
  const sig = JSON.stringify(rows)

  const paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const r = px(stage.card.radius)
    paintGlass(ctx, w, h, r, look)
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, r)
    ctx.clip()

    const pad = px(PAD)
    // Header: "Chats" on the outer side, the count on the inner one (mirrored on the right).
    ctx.textBaseline = 'middle'
    const headY = pad + px(HEAD) / 2
    ctx.font = font(700, 0.056)
    ctx.fillStyle = label
    ctx.textAlign = right ? 'right' : 'left'
    ctx.fillText('Chats', right ? w - pad : pad, headY)
    if (status) {
      ctx.font = font(600, 0.046)
      ctx.fillStyle = card.unread ? label : look.muted
      ctx.textAlign = right ? 'left' : 'right'
      ctx.fillText(status, right ? pad : w - pad, headY)
    }

    const top = pad + px(HEAD) + px(0.02)
    if (!rows.length) {
      ctx.textAlign = right ? 'right' : 'left'
      const x = right ? w - pad : pad
      ctx.font = font(700, 0.07)
      ctx.fillStyle = look.strong
      ctx.fillText('No chats yet', x, top + px(0.08))
      ctx.font = font(500, 0.046)
      ctx.fillStyle = look.muted
      ctx.fillText('Tap to add a friend or start a group', x, top + px(0.17))
      return
    }

    // Rows: one column on the 2×2 cards, two side by side on the wide phone strip.
    const cols = stage.portrait ? 2 : 1
    const rowH = px(0.15)
    const perCol = Math.max(1, Math.floor((h - top - pad) / rowH))
    const colW = (w - pad * 2 - (cols - 1) * pad) / cols
    const nameFont = font(700, 0.068)
    const quietFont = font(500, 0.068)
    const sideFont = font(600, 0.054)
    rows.slice(0, perCol * cols).forEach((row, i) => {
      const col = Math.floor(i / perCol)
      const x0 = pad + col * (colW + pad)
      const y = top + (i % perCol) * rowH + rowH / 2
      // A dot: lit while something's waiting.
      const dot = px(0.018)
      ctx.beginPath()
      ctx.arc(x0 + dot, y, dot, 0, Math.PI * 2)
      ctx.fillStyle = row.unread ? look.ink.calm : look.muted
      ctx.globalAlpha = row.unread ? 1 : 0.35
      ctx.fill()
      ctx.globalAlpha = 1
      // Count or time on the right of the row; the name takes what's left.
      const side = row.unread ? (row.unread > 99 ? '99+' : String(row.unread)) : row.when
      ctx.font = sideFont
      const sideW = side ? textWidth(side, sideFont) + px(0.03) : 0
      if (side) {
        ctx.fillStyle = row.unread ? look.strong : look.muted
        ctx.textAlign = 'right'
        ctx.fillText(side, x0 + colW, y)
      }
      const nx = x0 + dot * 2 + px(0.03)
      const f = row.unread ? nameFont : quietFont
      const [line] = wrap(row.name, f, x0 + colW - sideW - nx, 1)
      ctx.font = f
      ctx.fillStyle = row.unread ? look.strong : look.muted
      ctx.textAlign = 'left'
      ctx.fillText(line ?? '', nx, y)
    })
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
      deps={[sig, status, label, corner, stage]}
      present={p.present}
      onGone={p.onGone}
      delay={corner * 0.07}
      onPress={() => ui.openPeople(card.topUnread)}
    />
  )
}
