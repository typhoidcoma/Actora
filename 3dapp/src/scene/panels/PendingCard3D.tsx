import { useAgent } from '@actora/stores/agent'
import { kindOf, type PendingAction } from '@actora/stores/pending'
import { ui } from '@actora/stores/ui'
import { useStage } from '../../look/layout'
import { drawLines, font, paintGlass, px, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const PAD = 0.075
const HEAD = 0.085

/**
 * The 2D PendingCard, in the scene: box 4 while something waits for the user's
 * OK. "Waiting for your OK" in the urgent colour, what it is big, then her
 * summary (recipients, subject, the opening line). The answers are the pills
 * (Send it / Change it / Discard); a tap opens the chat to talk it over.
 */
export function PendingCard3D(p: { pending: PendingAction; corner: number; present: boolean; onGone: () => void }) {
  const { pending, corner } = p
  const look = useLook()
  const stage = useStage()
  const name = useAgent((s) => s.botName)
  const pose = stage.pose(corner)
  const { right, bottom } = pose
  const k = kindOf(pending.kind)
  const head = pending.status === 'retryable' ? 'Google hiccup · tap Try again' : 'Waiting for your OK'
  const summary = pending.summary || `${name} has it ready.`
  const tSize = stage.portrait ? 0.1 : 0.115

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
    // The dot, then the words, reading away from her (mirrored on the right).
    const dot = px(0.018)
    ctx.font = font(700, 0.056)
    const headW = ctx.measureText(head).width
    const dotX = right ? x - headW - dot * 2 : x + dot
    ctx.fillStyle = look.ink.urgent
    ctx.beginPath()
    ctx.arc(dotX, headY + px(HEAD) / 2, dot, 0, Math.PI * 2)
    ctx.fill()
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(head, right ? x : x + dot * 3, headY + px(HEAD) / 2)

    const max = w - pad * 2
    const tfont = font(700, tSize)
    const spacing = `${-px(tSize * 0.045)}px`
    const title = wrap(k.label, tfont, max, 1, spacing)
    const sfont = font(500, 0.052)
    const lines = wrap(summary, sfont, max, stage.portrait ? 2 : 3)
    const tlh = px(tSize) * 1.05
    const slh = px(0.052) * 1.35
    const block = title.length * tlh + px(0.03) + lines.length * slh
    const top = bottom ? pad : pad + px(HEAD)
    const room = h - pad - px(HEAD) - pad
    let y = top + Math.max(0, (room - block) / 2)
    y = drawLines(ctx, title, x, y, tlh, tfont, look.strong, align, spacing)
    drawLines(ctx, lines, x, y + px(0.03), slh, sfont, look.text, align)
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
      deps={[head, k.label, summary, corner, stage]}
      present={p.present}
      onGone={p.onGone}
      delay={0.1}
      onPress={ui.openChat}
    />
  )
}
