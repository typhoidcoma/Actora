import { useEffect, useState } from 'react'
import { useFinds } from '@actora/finds/finds'
import { ui } from '@actora/stores/ui'
import { useStage } from '../../look/layout'
import { drawLines, font, px, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const ROTATE_MS = 7000
const PAD = 0.075

/** A find's image, if its host allows it on a canvas (CORS); otherwise the card goes without. */
function useImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    setImg(null)
    if (!url) return
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => setImg(el)
    el.src = url
    return () => {
      el.onload = null
    }
  }, [url])
  return img
}

/** The fourth card: the agent's fun finds, rotating, dark like its photo. Tap to open them all. */
export function FindsCard3D({ corner, present }: { corner: number; present: boolean }) {
  const look = useLook()
  const { items, status } = useFinds()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (items.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [items.length])
  const f = items.length ? items[index % items.length] : null
  const img = useImage(f?.image ?? null)
  const stage = useStage()
  const pose = stage.pose(corner)
  const { right } = pose
  const short = stage.portrait

  const paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, px(stage.card.radius))
    ctx.clip()
    const base = ctx.createLinearGradient(0, 0, 0, h)
    base.addColorStop(0, '#8a8796')
    base.addColorStop(1, '#2b2932')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    if (img) {
      const s = Math.max(w / img.width, h / img.height)
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s)
    }
    const shade = ctx.createLinearGradient(0, h * 0.25, 0, h)
    shade.addColorStop(0, 'rgba(20,18,30,0)')
    shade.addColorStop(1, 'rgba(20,18,30,0.88)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, w, h)

    const pad = px(PAD)
    const x = right ? w - pad : pad
    const align: CanvasTextAlign = right ? 'right' : 'left'
    const max = w - pad * 2
    const white = '#FBF9F4'

    if (!f) {
      const msg = status === 'hunting' ? 'Finding fun things…' : 'Fun finds land here'
      drawLines(ctx, [msg], x, h - pad - px(0.07), px(0.07), font(700, 0.06), white, align)
      return
    }
    // The count, big, in the top corner (on a phone, inline: "4 fun things to see").
    ctx.textBaseline = 'top'
    ctx.fillStyle = withShadow(ctx, white)
    if (short) {
      ctx.textAlign = 'right'
      ctx.font = font(600, 0.044)
      const label = 'fun things to see'
      ctx.fillText(label, w - pad, pad + px(0.022))
      ctx.font = font(800, 0.085)
      ctx.fillText(String(items.length), w - pad - ctx.measureText(label).width - px(0.12), pad - px(0.01))
    } else {
      ctx.textAlign = align
      ctx.font = font(800, 0.2)
      ctx.fillText(String(items.length), x, pad * 0.9)
      ctx.font = font(600, 0.048)
      ctx.fillText('fun things to see', x, pad + px(0.2))
    }
    ctx.shadowBlur = 0

    // The current find, from the bottom up.
    const blurb = short ? [] : wrap(f.blurb || f.why, font(500, 0.042), max, 1)
    const title = wrap(f.title, font(700, 0.066), max, short ? 1 : 2, `${-px(0.002)}px`)
    let y = h - pad - blurb.length * px(0.042) * 1.35 - title.length * px(0.066) * 1.08 - px(0.06)
    ctx.font = font(700, 0.032)
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#FFBE0B'
    ctx.textAlign = right ? 'right' : 'left'
    ctx.fillText(f.tag || f.source, x, y)
    ctx.fillStyle = 'rgba(251,249,244,0.7)'
    ctx.textAlign = right ? 'left' : 'right'
    ctx.fillText(`${(index % items.length) + 1} / ${items.length}`, right ? pad : w - pad, y)
    y += px(0.055)
    y = drawLines(ctx, title, x, y, px(0.066) * 1.08, font(700, 0.066), white, align, `${-px(0.002)}px`)
    drawLines(ctx, blurb, x, y + px(0.008), px(0.042) * 1.35, font(500, 0.042), 'rgba(251,249,244,0.85)', align)
  }

  return (
    <Pane
      width={stage.card.w}
      height={stage.card.h}
      radius={stage.card.radius}
      position={pose.position}
      rotation={pose.rotation}
      paint={paint}
      deps={[f?.id, img, items.length, status, index, corner, look.day, stage]}
      delay={0.21}
      present={present}
      onPress={() => ui.openFinds()}
    />
  )
}

function withShadow(ctx: CanvasRenderingContext2D, color: string): string {
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = px(0.02)
  return color
}
