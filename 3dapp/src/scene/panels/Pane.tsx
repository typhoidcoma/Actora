import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { float, mix, texture as tslTexture, uniform, vec4, viewportSharedTexture } from 'three/tsl'
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js'
import { useFonts } from '../../look/fonts'
import { backOut, damp } from '../../look/motion'
import { UI_LAYER } from '../../look/layers'
import { PPU } from '../../look/paint'
import { parseCss, useLook } from '../../look/theme'

/** How far the glass blurs the room behind it, in screen UV (the 2D pills' backdrop blur). */
const BLUR = 0.02

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
  /** Text only: no body behind it (her line). */
  bare?: boolean
  /** An alarm: the panel's edge breathes in this colour (bloom carries it). */
  ring?: string | null
  present?: boolean
  onGone?: () => void
  delay?: number
  /** uv in canvas space (0,0 top-left). */
  onPress?: (uv: { x: number; y: number }) => void
  /** Uniform scale of the whole panel (the phone stack is drawn at canonical size, then fitted). */
  size?: number
}

export function roundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
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

/**
 * One surface of the 2D UI, standing in the room, in the same glass as the 2D
 * pills: the room behind it blurred (the 2D backdrop-filter), under a face
 * painted on a canvas (the glass tint, sheen and hairline from paintGlass, then
 * the type). No body, so no edge. The 2D motion: scale in with a little
 * overshoot, ease out, glide to a new spot, lift on hover; an alarm breathes.
 */
export function Pane({ width, height, radius = 0.06, position, rotation, paint, deps, bare, ring, present = true, onGone, delay = 0, onPress, size = 1 }: PaneProps) {
  const look = useLook()
  const fonts = useFonts((s) => s.ready)
  const pw = Math.round(width * PPU)
  const ph = Math.round(height * PPU)

  // WebGPU textures can't change size: a new canvas and texture per pixel size.
  // Two faces: the one showing, and the one before it, which it cross-fades from
  // when the theme changes (the 2D app cross-fades its colours over 1.2 s).
  const face = useMemo(() => {
    const make = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pw
      canvas.height = ph
      // A canvas with no context yet can't be uploaded ("CopyExternalImageToTexture:
      // fails extracting valid resource"): give it one, even if it's never drawn.
      canvas.getContext('2d')
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      texture.generateMipmaps = true
      texture.minFilter = THREE.LinearMipmapLinearFilter
      return { canvas, texture }
    }
    const cur = make()
    const prev = make()
    return { canvas: cur.canvas, texture: cur.texture, prevCanvas: prev.canvas, prevTexture: prev.texture }
  }, [pw, ph])
  const geometry = useMemo(() => roundedRect(width, height, radius), [width, height, radius])
  const u = useMemo(() => ({ appear: uniform(0), tint: uniform(new THREE.Color()), tintAmount: uniform(0), blend: uniform(1) }), [])

  // Unlit, so the type reads the same in sun or shade. Glass panes show the room
  // behind them, blurred; the bare line is just its type.
  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    const f = mix(tslTexture(face.prevTexture), tslTexture(face.texture), u.blend)
    if (bare) {
      m.colorNode = f.rgb
      m.opacityNode = f.a.mul(u.appear)
    } else {
      const behind = hashBlur(viewportSharedTexture(), float(BLUR), { repeats: float(24) })
      const glass = mix(behind.rgb, f.rgb, f.a)
      // Hover lifts it toward the accent; an alarm breathes the urgent colour into it.
      m.colorNode = vec4(mix(glass, u.tint, u.tintAmount), 1)
      m.opacityNode = u.appear
    }
    return m
  }, [face, bare, u])

  useEffect(
    () => () => {
      face.texture.dispose()
      face.prevTexture.dispose()
      geometry.dispose()
      material.dispose()
    },
    [face, geometry, material],
  )

  // Paint whenever the content, the look or the fonts change. A change of theme
  // keeps the old face and fades to the new one; content changes are immediate.
  const lookKey = `${look.day}|${look.glass}|${look.strong}|${look.text}|${look.role.accent}`
  const lastLook = useRef(lookKey)
  useEffect(() => {
    const ctx = face.canvas.getContext('2d')!
    if (lastLook.current !== lookKey) {
      const prev = face.prevCanvas.getContext('2d')!
      prev.clearRect(0, 0, pw, ph)
      prev.drawImage(face.canvas, 0, 0)
      face.prevTexture.needsUpdate = true
      u.blend.value = 0
      lastLook.current = lookKey
    }
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
  const accentColor = useMemo(() => parseCss(look.role.accent).color.clone(), [look.role.accent])

  const group = useRef<THREE.Group>(null)
  const anim = useRef({ t: 0, wait: delay, hover: 0, placed: false, gone: false })
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
      if (!a.gone) onGone?.()
      a.gone = true
      return
    }
    a.gone = false
    g.visible = true
    a.hover = damp(a.hover, hover ? 1 : 0, 14, dt)
    const s = (present ? 0.92 + 0.08 * backOut(a.t) : 0.94 + 0.06 * a.t) * (1 + a.hover * 0.012)
    g.scale.setScalar(s * size)
    g.position.x = damp(g.position.x, position[0], 8, dt)
    g.position.y = damp(g.position.y, position[1] - (1 - a.t) * 0.05, 8, dt)
    g.position.z = damp(g.position.z, position[2] + a.hover * 0.04, 8, dt)
    u.appear.value = present ? Math.min(1, a.t * 1.6) : a.t
    if (u.blend.value < 1) u.blend.value = Math.min(1, u.blend.value + dt / 1.2)

    if (ringColor) {
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5.2)
      u.tint.value.copy(ringColor)
      u.tintAmount.value = 0.04 + pulse * 0.12
    } else {
      u.tint.value.copy(accentColor)
      u.tintAmount.value = a.hover * 0.08
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
      <mesh geometry={geometry} material={material} renderOrder={2} layers={UI_LAYER} {...handlers} />
    </group>
  )
}
