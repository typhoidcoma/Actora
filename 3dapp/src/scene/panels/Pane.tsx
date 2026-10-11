import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { texture as tslTexture, uniform } from 'three/tsl'
import { useFonts } from '../../look/fonts'
import { backOut, damp } from '../../look/motion'
import { PPU } from '../../look/paint'
import { parseCss, useLook } from '../../look/theme'

/** How thick a panel is: enough to catch light on its edge and cast a real shadow. */
const DEPTH = 0.022

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
  /** Where it enters from, relative to its spot (default: just below it). */
  from?: [number, number, number]
  /** Uniform scale of the whole panel (the phone stack is drawn at canonical size, then fitted). */
  size?: number
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

/** The panel's body: the same rounded rectangle, extruded, its front face just behind the painted face. */
function slab(w: number, h: number, r: number): THREE.ExtrudeGeometry {
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
  const g = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 })
  g.translate(0, 0, -DEPTH - 0.006)
  return g
}

/**
 * One surface of the 2D UI, standing in the room: a thin solid panel that takes
 * the room's real light (the sun through the windows, her mood in the cove),
 * casts a shadow on the floor, and carries its face (text, washes) painted on a
 * canvas that stays readable in any light. The 2D motion: scale in with a little
 * overshoot, ease out, glide to a new spot, lift on hover.
 */
export function Pane({ width, height, radius = 0.06, position, rotation, paint, deps, bare, ring, present = true, onGone, delay = 0, onPress, from, size = 1 }: PaneProps) {
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
  const body = useMemo(() => (bare ? null : slab(width, height, radius)), [bare, width, height, radius])

  const u = useMemo(() => ({ appear: uniform(0) }), [])

  // The face: unlit, so text reads the same in sun or shade.
  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    const f = tslTexture(face.texture)
    m.colorNode = f.rgb
    m.opacityNode = f.a.mul(u.appear)
    return m
  }, [face, u])

  // The body: the theme's surface, lit by the room.
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, transparent: true }), [])
  useEffect(() => {
    parseCss(look.day ? '#f6f1ea' : '#26244a', bodyMaterial.color)
  }, [look.day, bodyMaterial])

  useEffect(
    () => () => {
      face.texture.dispose()
      geometry.dispose()
      body?.dispose()
      material.dispose()
      bodyMaterial.dispose()
    },
    [face, geometry, body, material, bodyMaterial],
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
  const accentColor = useMemo(() => parseCss(look.role.accent).color.clone(), [look.role.accent])

  const group = useRef<THREE.Group>(null)
  const anim = useRef({ t: 0, wait: delay, hover: 0, placed: false, gone: false })
  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const a = anim.current
    if (!a.placed) {
      g.position.set(position[0] + (from?.[0] ?? 0), position[1] + (from?.[1] ?? 0), position[2] + (from?.[2] ?? 0))
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

    bodyMaterial.opacity = u.appear.value
    if (ringColor) {
      // The alarm: the body glows past white at the peak, so the bloom carries it.
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5.2)
      bodyMaterial.emissive.copy(ringColor)
      bodyMaterial.emissiveIntensity = 0.06 + pulse * 0.22
    } else {
      bodyMaterial.emissive.copy(accentColor)
      bodyMaterial.emissiveIntensity = a.hover * 0.3
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
      {body && <mesh geometry={body} material={bodyMaterial} castShadow receiveShadow />}
      <mesh geometry={geometry} material={material} renderOrder={2} {...handlers} />
    </group>
  )
}
