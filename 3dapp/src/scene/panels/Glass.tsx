import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { FONT, useFonts } from '../../look/fonts'
import { backOut, damp } from '../../look/motion'
import { parseCss, useLook, type Look } from '../../look/theme'

/** Canvas pixels per world unit: sharp at the distances the camera sits. */
const PPU = 440
const DEPTH = 0.012
const BEVEL = 0.006
const PAD = 0.06

export interface GlassProps {
  width: number
  /** Fixed height; omitted, the panel grows to fit its text (up to maxHeight). */
  height?: number
  maxHeight?: number
  kicker?: string
  kickerColor?: string
  title?: string
  body?: string
  titleSize?: number
  bodySize?: number
  align?: 'left' | 'center'
  caret?: boolean
  /** Reading surface (chat input): the thicker, more opaque glass. */
  thick?: boolean
  /** Edge and hover tint. */
  accent?: string
  /** An alarm: the edge glows and breathes in this colour (bloom carries it). */
  glow?: string | null
  position: [number, number, number]
  rotation?: [number, number, number]
  /** False plays the exit, then calls onGone. */
  present?: boolean
  onGone?: () => void
  /** Seconds to wait before appearing (staggered lists). */
  delay?: number
  onPress?: () => void
}

interface Laid {
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, look: Look) => void
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

const measure = document.createElement('canvas').getContext('2d')!

/** Lays the text out once: the height it needs, and how to paint it. */
function layout(p: GlassProps): Laid {
  const px = (u: number) => u * PPU
  const max = px(p.width - PAD * 2)
  const blocks: Array<{ font: string; lines: string[]; lh: number; color: (l: Look) => string; spacing: string }> = []
  const add = (text: string, font: string, size: number, lh: number, color: (l: Look) => string, spacing = '0px', cap?: number) => {
    measure.font = font
    measure.letterSpacing = spacing
    let lines = wrap(measure, text, max)
    if (cap && lines.length > cap) {
      lines = lines.slice(0, cap)
      lines[cap - 1] = `${lines[cap - 1].replace(/\s*\S*$/, '')}…`
    }
    blocks.push({ font, lines, lh: px(size) * lh, color, spacing })
  }
  if (p.kicker) add(p.kicker.toUpperCase(), `600 ${px(0.04)}px ${FONT}`, 0.04, 1.5, (l) => p.kickerColor ?? l.muted, `${px(0.004)}px`, 1)
  if (p.title) add(p.title, `700 ${px(p.titleSize ?? 0.08)}px ${FONT}`, p.titleSize ?? 0.08, 1.08, (l) => l.strong, `${-px(0.0025)}px`, 2)
  if (p.body !== undefined) add(p.body, `500 ${px(p.bodySize ?? 0.056)}px ${FONT}`, p.bodySize ?? 0.056, 1.35, (l) => l.text)

  const gap = px(0.018)
  const content = blocks.reduce((h, b) => h + b.lines.length * b.lh, 0) + gap * Math.max(0, blocks.length - 1)
  let height = p.height ?? Math.min(p.maxHeight ?? Infinity, content / PPU + PAD * 2)
  height = Math.max(height, (p.bodySize ?? 0.056) * 1.35 + PAD * 1.4)

  return {
    height,
    draw(ctx, w, h, look) {
      const cx = p.align === 'center' ? w / 2 : px(PAD)
      ctx.textAlign = p.align === 'center' ? 'center' : 'left'
      ctx.textBaseline = 'top'
      // Fixed-height panels (pills, input) centre their text; grown ones start at the pad.
      let y = p.height ? (h - content) / 2 : px(PAD)
      let lastEnd = 0
      for (const [i, b] of blocks.entries()) {
        ctx.font = b.font
        ctx.letterSpacing = b.spacing
        ctx.fillStyle = b.color(look)
        for (const line of b.lines) {
          if (y + b.lh > h - px(PAD) * 0.5 && y > px(PAD)) break
          ctx.fillText(line, cx, y + b.lh * 0.1)
          lastEnd = ctx.measureText(line).width
          y += b.lh
        }
        if (i < blocks.length - 1) y += gap
      }
      if (p.caret) {
        const b = blocks[blocks.length - 1]
        const x = p.align === 'center' ? cx + lastEnd / 2 + 4 : cx + lastEnd + 4
        ctx.fillStyle = p.accent ?? look.role.accent
        ctx.fillRect(x, y - b.lh * 0.92, Math.max(3, px(0.006)), b.lh * 0.8)
      }
    },
  }
}

function roundedSlab(w: number, h: number, r: number): THREE.ExtrudeGeometry {
  const x = -w / 2 + BEVEL
  const y = -h / 2 + BEVEL
  const iw = w - BEVEL * 2
  const ih = h - BEVEL * 2
  const rr = Math.max(0.001, Math.min(r - BEVEL, iw / 2, ih / 2))
  const s = new THREE.Shape()
  s.moveTo(x + rr, y)
  s.lineTo(x + iw - rr, y)
  s.quadraticCurveTo(x + iw, y, x + iw, y + rr)
  s.lineTo(x + iw, y + ih - rr)
  s.quadraticCurveTo(x + iw, y + ih, x + iw - rr, y + ih)
  s.lineTo(x + rr, y + ih)
  s.quadraticCurveTo(x, y + ih, x, y + ih - rr)
  s.lineTo(x, y + rr)
  s.quadraticCurveTo(x, y, x + rr, y)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 10,
  })
  g.translate(0, 0, -DEPTH / 2)
  return g
}

/**
 * A pane of the app's frosted glass, in the scene: real transmission (the sky and
 * her light blur through it), the scheme's glass tint and Satoshi text on a canvas
 * face, an edge that catches the hover accent, and an alarm glow when it rings.
 */
export function Glass(props: GlassProps) {
  const { width, position, rotation, present = true, onGone, delay = 0, onPress, glow, accent } = props
  const look = useLook()
  const fontsReady = useFonts((s) => s.ready)
  const laid = useMemo(
    () => layout(props),
    [width, props.height, props.maxHeight, props.kicker, props.title, props.body, props.titleSize, props.bodySize, props.align, props.caret, props.kickerColor, props.accent, fontsReady],
  )
  // Snap height to 1 cm so streaming text doesn't rebuild the slab every token.
  const height = Math.ceil(laid.height * 100) / 100
  const radius = Math.min(height / 2, props.height ? height / 2 : 0.07)

  const geometry = useMemo(() => roundedSlab(width, height, radius), [width, height, radius])
  useEffect(() => () => geometry.dispose(), [geometry])

  const canvas = useMemo(() => document.createElement('canvas'), [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [canvas])
  const face = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
    [texture],
  )
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        roughness: 0.42,
        thickness: 0.05,
        ior: 1.22,
        metalness: 0,
        specularIntensity: 0.6,
        transparent: true,
      }),
    [],
  )
  useEffect(
    () => () => {
      texture.dispose()
      face.dispose()
      glass.dispose()
    },
    [texture, face, glass],
  )

  const [hover, setHover] = useState(false)
  useEffect(() => {
    if (!onPress) return
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover, onPress])

  // Paint the face: the scheme's glass fill, a soft top sheen, the edge line, the text.
  useEffect(() => {
    const w = Math.round(width * PPU)
    const h = Math.round(height * PPU)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const r = radius * PPU
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    ctx.roundRect(1.5, 1.5, w - 3, h - 3, Math.max(0, r - 1.5))
    ctx.fillStyle = props.thick ? look.glassThick : look.glass
    ctx.fill()
    const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.5)
    sheen.addColorStop(0, look.day ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.10)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fill()
    ctx.lineWidth = glow ? 5 : 2.5
    ctx.strokeStyle = glow ?? (hover && accent ? accent : look.day ? 'rgba(255,255,255,0.9)' : look.line)
    ctx.stroke()
    laid.draw(ctx, w, h, look)
    texture.needsUpdate = true
  }, [canvas, texture, laid, look, width, height, radius, hover, glow, accent, props.thick])

  // Glass tint follows the theme: near-white by day, the scheme's lavender at dusk.
  useEffect(() => {
    const tint = parseCss(look.day ? '#ffffff' : look.role.agent).color
    glass.color.copy(tint).lerp(new THREE.Color(1, 1, 1), look.day ? 0 : 0.55)
    glass.roughness = look.day ? 0.5 : 0.38
  }, [glass, look])

  const group = useRef<THREE.Group>(null)
  const anim = useRef({ t: 0, wait: delay, hover: 0, first: true })
  const glowColor = useMemo(() => new THREE.Color(), [])
  const accentColor = useMemo(() => new THREE.Color(), [])
  useEffect(() => void (glow && parseCss(glow, glowColor)), [glow, glowColor])
  useEffect(() => void parseCss(accent ?? look.role.accent, accentColor), [accent, look, accentColor])

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const a = anim.current
    if (a.first) {
      g.position.set(...position)
      a.first = false
    }
    if (present && a.wait > 0) {
      a.wait -= dt
      g.visible = false
      return
    }
    a.t = Math.min(1, Math.max(0, a.t + (present ? dt / 0.5 : -dt / 0.28)))
    if (!present && a.t === 0) {
      g.visible = false
      onGone?.()
      return
    }
    g.visible = a.t > 0.001
    a.hover = damp(a.hover, hover ? 1 : 0, 14, dt)

    const s = (present ? backOut(a.t) : 0.9 + a.t * 0.1) * (1 + a.hover * 0.035)
    g.scale.setScalar(Math.max(0.001, s))
    g.position.x = damp(g.position.x, position[0], 9, dt)
    g.position.y = damp(g.position.y, position[1] - (1 - a.t) * 0.06, 9, dt)
    g.position.z = damp(g.position.z, position[2] + a.hover * 0.03, 9, dt)
    face.opacity = a.t
    glass.opacity = a.t

    if (glow) {
      // The alarm breathes: bright enough to bloom at the peak.
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.2)
      glass.emissive.copy(glowColor)
      glass.emissiveIntensity = 0.6 + pulse * 2.4
    } else {
      glass.emissive.copy(accentColor)
      glass.emissiveIntensity = a.hover * 0.35
    }
  })

  const press = onPress
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onPress()
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHover(true)
        },
        onPointerOut: () => setHover(false),
      }
    : {}

  return (
    <group ref={group} rotation={rotation} visible={false}>
      <mesh geometry={geometry} material={glass} castShadow={false} renderOrder={1} {...press} />
      <mesh position-z={DEPTH / 2 + BEVEL + 0.0015} material={face} renderOrder={2}>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  )
}
