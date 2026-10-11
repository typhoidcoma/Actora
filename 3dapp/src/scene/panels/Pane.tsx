import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { float, mix, texture as tslTexture, uniform, vec4, viewportSharedTexture } from 'three/tsl'
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js'
import { useFonts } from '../../look/fonts'
import { backOut, damp } from '../../look/motion'
import { PPU } from '../../look/paint'
import { parseCss, useLook } from '../../look/theme'

/** How far the 2D glass blurs what's behind it, in screen UV. */
const BLUR = 0.022
const HALO = 0.16

export interface PaneProps {
  width: number
  height: number
  /** Corner radius (world units). */
  radius?: number
  position: [number, number, number]
  rotation?: [number, number, number]
  /** Paints the face (fill, text). Re-run when `deps` change. */
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  deps: unknown[]
  /** Text only: no glass behind it (her line). */
  bare?: boolean
  /** An alarm: a halo that breathes in this colour around the pane. */
  ring?: string | null
  present?: boolean
  onGone?: () => void
  delay?: number
  /** uv in canvas space (0,0 top-left). */
  onPress?: (uv: { x: number; y: number }) => void
}

function roundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  r = Math.min(r, w / 2, h / 2)
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  const g = new THREE.ShapeGeometry(s, 12)
  // Shape UVs are in shape units; the face texture wants 0..1 across the pane.
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - x) / w, (pos.getY(i) - y) / h)
  return g
}

/** A soft blurred outline outside the pane: its drop shadow, or its alarm halo. */
function haloTexture(w: number, h: number, r: number): THREE.CanvasTexture {
  const scale = PPU / 4
  const c = document.createElement('canvas')
  const m = HALO * scale
  c.width = Math.round(w * scale + m * 2)
  c.height = Math.round(h * scale + m * 2)
  const ctx = c.getContext('2d')!
  ctx.shadowColor = '#fff'
  ctx.shadowBlur = m * 0.55
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.roundRect(m, m, w * scale, h * scale, r * scale)
  ctx.fill()
  // Only outside the pane: inside, the glass shows the real backdrop.
  ctx.shadowBlur = 0
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * One surface of the 2D UI, standing in the scene: frosted glass that really
 * blurs what's behind it (the 2D backdrop-filter), a face painted on a canvas,
 * a soft shadow (or an alarm halo), and the 2D motion: scale in with a little
 * overshoot, ease out, glide to a new spot, lift on hover.
 */
export function Pane({ width, height, radius = 0.06, position, rotation, paint, deps, bare, ring, present = true, onGone, delay = 0, onPress }: PaneProps) {
  const look = useLook()
  const fonts = useFonts((s) => s.ready)
  const pw = Math.round(width * PPU)
  const ph = Math.round(height * PPU)

  // WebGPU textures can't change size: a new canvas and texture per pixel size.
  const face = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    return { canvas, texture: t }
  }, [pw, ph])
  const geometry = useMemo(() => roundedRect(width, height, radius), [width, height, radius])
  const halo = useMemo(() => haloTexture(width, height, radius), [width, height, radius])

  const u = useMemo(() => ({ appear: uniform(0), haloColor: uniform(new THREE.Color()), haloAlpha: uniform(0) }), [])

  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    const f = tslTexture(face.texture)
    if (bare) {
      m.colorNode = f.rgb
      m.opacityNode = f.a.mul(u.appear)
    } else {
      const behind = hashBlur(viewportSharedTexture(), float(BLUR), { repeats: float(28) })
      m.colorNode = vec4(mix(behind.rgb, f.rgb, f.a), 1)
      m.opacityNode = u.appear
    }
    return m
  }, [face, bare, u])

  const haloMaterial = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    m.colorNode = u.haloColor
    m.opacityNode = tslTexture(halo).a.mul(u.haloAlpha).mul(u.appear)
    return m
  }, [halo, u])

  useEffect(
    () => () => {
      face.texture.dispose()
      geometry.dispose()
      halo.dispose()
      material.dispose()
      haloMaterial.dispose()
    },
    [face, geometry, halo, material, haloMaterial],
  )

  // Paint whenever the content, the look or the fonts change.
  useEffect(() => {
    const ctx = face.canvas.getContext('2d')!
    ctx.clearRect(0, 0, pw, ph)
    ctx.save()
    paint(ctx, pw, ph)
    ctx.restore()
    face.texture.needsUpdate = true
  }, [face, look, fonts, ...deps])

  const [hover, setHover] = useState(false)
  useEffect(() => {
    if (!onPress || !hover) return
    document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover, onPress])

  const ringColor = useMemo(() => (ring ? parseCss(ring).color.clone() : null), [ring])
  const shadowColor = useMemo(() => parseCss(look.day ? '#1a1936' : '#000000').color.clone(), [look.day])

  const group = useRef<THREE.Group>(null)
  const anim = useRef({ t: 0, wait: delay, hover: 0, placed: false })
  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const a = anim.current
    if (!a.placed) {
      g.position.set(...position)
      a.placed = true
    }
    if (present && a.wait > 0) {
      a.wait -= dt
      g.visible = false
      return
    }
    a.t = Math.min(1, Math.max(0, a.t + (present ? dt / 0.55 : -dt / 0.3)))
    if (!present && a.t === 0) {
      g.visible = false
      onGone?.()
      return
    }
    g.visible = true
    a.hover = damp(a.hover, hover ? 1 : 0, 14, dt)
    const s = (present ? 0.92 + 0.08 * backOut(a.t) : 0.94 + 0.06 * a.t) * (1 + a.hover * 0.012)
    g.scale.setScalar(s)
    g.position.x = damp(g.position.x, position[0], 8, dt)
    g.position.y = damp(g.position.y, position[1] - (1 - a.t) * 0.05, 8, dt)
    g.position.z = damp(g.position.z, position[2] + a.hover * 0.04, 8, dt)
    u.appear.value = present ? Math.min(1, a.t * 1.6) : a.t

    if (ringColor) {
      // Brighter than white at the peak, so the bloom carries it.
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5.2)
      u.haloColor.value.copy(ringColor).multiplyScalar(1.2 + pulse * 1.3)
      u.haloAlpha.value = 0.55 + pulse * 0.45
    } else {
      u.haloColor.value.copy(shadowColor)
      u.haloAlpha.value = bare ? 0 : look.day ? 0.1 : 0.3
    }
  })

  const handlers = onPress
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.uv) onPress({ x: e.uv.x, y: 1 - e.uv.y })
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
      {!bare && (
        <mesh position={[0, -0.025, -0.004]} material={haloMaterial} renderOrder={1}>
          <planeGeometry args={[width + HALO * 2, height + HALO * 2]} />
        </mesh>
      )}
      <mesh geometry={geometry} material={material} renderOrder={2} {...handlers} />
    </group>
  )
}
