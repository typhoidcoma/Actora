import { messageMeta } from '@actora/social/homeCard'
import type { MessageCardData } from '@actora/stores/social'
import { ui } from '@actora/stores/ui'
import { ago } from '@actora/ui/format'
import { useNow } from '@actora/ui/tiles/data'
import { useStage } from '../../look/layout'
import { drawLines, font, paintGlass, px, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const PAD = 0.075
const HEAD = 0.085

/**
 * The 2D MessageCard, in the scene: "Message" up top, who wrote big, then how
 * many and when. Never the text. Laid out like PriorityCard3D (mirrored on the
 * right, read upward on the bottom row); a tap opens the conversation.
 */
export function MessageCard3D(p: { card: MessageCardData; corner: number; present: boolean; onGone: () => void }) {
  const { card, corner } = p
  const look = useLook()
  const stage = useStage()
  const now = useNow(30_000)
  const pose = stage.pose(corner)
  const { right, bottom } = pose
  const tSize = stage.portrait ? 0.11 : 0.128
  const tCap = stage.portrait ? 1 : 2
  const urgency = card.score / 100
  const label = urgency >= 0.8 ? look.ink.urgent : urgency >= 0.5 ? look.ink.mid : look.ink.calm
  const meta = messageMeta(card, ago(card.at, now))

  const paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const r = px(stage.card.radius)
    paintGlass(ctx, w, h, r, look)
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, r)
    ctx.clip()

    const pad = px(PAD)
    const align: CanvasTextAlign = right ? 'right' : 'left'
    const x = right ? w - pad : pad
    const headY = bottom ? h - pad - px(HEAD) : pad
    ctx.font = font(700, 0.056)
    ctx.fillStyle = label
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText('Message', x, headY + px(HEAD) / 2)

    const max = w - pad * 2
    const tfont = font(700, tSize)
    const spacing = `${-px(tSize * 0.045)}px`
    const title = wrap(card.from, tfont, max, tCap, spacing)
    const mfont = font(600, 0.05)
    const metaLines = wrap(meta, mfont, max, 1)
    const tlh = px(tSize) * 1.0
    const mlh = px(0.05) * 1.35
    const block = title.length * tlh + px(0.03) + mlh
    const top = bottom ? pad : pad + px(HEAD)
    const room = h - pad - px(HEAD) - pad
    let y = top + Math.max(0, (room - block) / 2)
    y = drawLines(ctx, title, x, y, tlh, tfont, look.strong, align, spacing)
    drawLines(ctx, metaLines, x, y + px(0.03), mlh, mfont, look.muted, align)
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
      deps={[card.from, meta, label, corner, stage]}
      present={p.present}
      onGone={p.onGone}
      delay={corner * 0.07}
      onPress={() => ui.openPeople(card.threadId)}
    />
  )
}
