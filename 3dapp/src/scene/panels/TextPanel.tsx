import type { ThreeElements } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three/webgpu'

/** Canvas pixels per world unit: sharp at the distances the camera sits. */
const PPU = 420
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface PanelText {
  kicker?: string
  title?: string
  body?: string
  /** Accent for the kicker and border. */
  tone?: string
  align?: 'left' | 'center'
  /** Title size in world units. */
  titleSize?: number
  bodySize?: number
  /** Blinking caret after the body (the chat input). */
  caret?: boolean
  fill?: string
}

type Props = PanelText &
  Omit<ThreeElements['group'], 'children'> & {
    width: number
    height: number
    onPress?: () => void
  }

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width > max && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, r)
}

/** Text drawn on a 2D canvas and shown on a plane: WebGPU-safe 3D text without a font atlas. */
export function TextPanel({ width, height, onPress, kicker, title, body, tone, align, titleSize, bodySize, caret, fill, ...group }: Props) {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [canvas])
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const w = Math.round(width * PPU)
    const h = Math.round(height * PPU)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const pad = 0.06 * PPU
    const accent = tone ?? '#8f86ff'

    ctx.clearRect(0, 0, w, h)
    roundRect(ctx, w, h, Math.min(h / 2, 0.08 * PPU))
    ctx.fillStyle = fill ?? (hover ? 'rgba(40,42,72,0.86)' : 'rgba(22,23,44,0.78)')
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = hover ? accent : 'rgba(255,255,255,0.12)'
    ctx.stroke()

    ctx.textBaseline = 'top'
    ctx.textAlign = align === 'center' ? 'center' : 'left'
    const x = align === 'center' ? w / 2 : pad
    const max = w - pad * 2
    let y = pad

    if (kicker) {
      ctx.font = `600 ${0.045 * PPU}px ${FONT}`
      ctx.fillStyle = accent
      ctx.fillText(kicker.toUpperCase(), x, y)
      y += 0.07 * PPU
    }
    const lines = (text: string, size: number, weight: number, color: string) => {
      ctx.font = `${weight} ${size * PPU}px ${FONT}`
      ctx.fillStyle = color
      const lh = size * PPU * 1.3
      const all = wrap(ctx, text, max)
      const room = Math.max(1, Math.floor((h - pad - y) / lh))
      const shown = all.slice(0, room)
      if (all.length > room) shown[room - 1] = `${shown[room - 1].replace(/\s*\S*$/, '')}…`
      for (const l of shown) {
        ctx.fillText(l, x, y)
        y += lh
      }
      return shown
    }
    if (title) lines(title, titleSize ?? 0.075, 600, '#f2f2fb')
    if (body !== undefined) {
      const shown = lines(body, bodySize ?? 0.055, 400, 'rgba(233,233,245,0.78)')
      if (caret) {
        const last = shown[shown.length - 1] ?? ''
        const cx = (align === 'center' ? w / 2 + ctx.measureText(last).width / 2 : x + ctx.measureText(last).width) + 4
        const lh = (bodySize ?? 0.055) * PPU * 1.3
        ctx.fillStyle = accent
        ctx.fillRect(cx, y - lh, 3, lh * 0.85)
      }
    }
    texture.needsUpdate = true
  }, [canvas, texture, width, height, kicker, title, body, tone, align, titleSize, bodySize, caret, fill, hover])

  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    if (!onPress) return
    document.body.style.cursor = hover ? 'pointer' : ''
  }, [hover, onPress])

  return (
    <group {...group}>
      <mesh
        scale={hover && onPress ? 1.03 : 1}
        onClick={onPress && ((e) => (e.stopPropagation(), onPress()))}
        onPointerOver={onPress && (() => setHover(true))}
        onPointerOut={onPress && (() => setHover(false))}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
