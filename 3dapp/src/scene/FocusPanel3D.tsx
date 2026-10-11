import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { useFocused } from '../look/focus'
import { FOCUS_RADIUS, useFocusHost } from '../look/focusHost'
import { focusLayout } from '../look/layout'
import { damp } from '../look/motion'
import { parseCss, useLook } from '../look/theme'

const EDGE = 0.022

/** A rounded rectangle's outline, for the slab's edge. */
function slab(w: number, h: number, r: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  const g = new THREE.ExtrudeGeometry(s, { depth: EDGE, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 12 })
  g.translate(0, 0, -EDGE - 0.004)
  return g
}

/**
 * The focus panel as a thing in the world. The 2D app's content (chat, item,
 * list, finds, vault) lives in a DOM element placed in the scene with CSS 3D
 * transforms that follow the camera, so it has perspective, parallax and turns
 * toward her; WebGPU gives the same plane a glass edge with thickness and a
 * shadow. It flies in from her right and out again, content and glass together.
 */
export function FocusPanel3D() {
  const focused = useFocused()
  const look = useLook()
  const { size, camera, gl } = useThree()
  const f = focusLayout(size.width / size.height)

  // The DOM size: the panel's on-screen size when it faces the camera, so text is crisp.
  const pxW = Math.round((f.rect.x1 - f.rect.x0) * size.width)
  const pxH = Math.round((f.rect.y1 - f.rect.y0) * size.height)
  const unit = f.panel.w / pxW

  // CSS3D: one renderer laid over the canvas, one object holding the content's host element.
  const css = useMemo(() => {
    const renderer = new CSS3DRenderer()
    const root = renderer.domElement
    Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '15' })
    const scene = new THREE.Scene()
    const el = document.createElement('div')
    el.className = 'focus-host'
    const obj = new CSS3DObject(el)
    scene.add(obj)
    return { renderer, scene, el, obj }
  }, [])
  useEffect(() => {
    const parent = (gl.domElement as HTMLCanvasElement).parentElement?.parentElement ?? document.body
    parent.appendChild(css.renderer.domElement)
    useFocusHost.setState({ el: css.el })
    return () => {
      css.renderer.domElement.remove()
      useFocusHost.setState({ el: null })
    }
  }, [css, gl])
  useEffect(() => {
    css.renderer.setSize(size.width, size.height)
    Object.assign(css.el.style, { width: `${pxW}px`, height: `${pxH}px`, borderRadius: `${FOCUS_RADIUS}px` })
    useFocusHost.setState({ w: pxW, h: pxH })
  }, [css, size, pxW, pxH])

  // The glass edge and its shadow share the content's pose.
  const geometry = useMemo(() => slab(f.panel.w, f.panel.h, FOCUS_RADIUS * unit), [f.panel.w, f.panel.h, unit])
  useEffect(() => () => geometry.dispose(), [geometry])
  const edge = useMemo(
    () => [
      new THREE.MeshBasicMaterial({ visible: false }),
      new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2, transparent: true }),
    ],
    [],
  )
  useEffect(() => {
    parseCss(look.day ? '#ffffff' : look.role.agent, (edge[1] as THREE.MeshPhysicalMaterial).color)
  }, [look, edge])

  const group = useRef<THREE.Group>(null)
  const anim = useRef({ t: 0 })
  const turn = f.portrait ? 0 : -0.14
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const a = anim.current
    a.t = damp(a.t, focused ? 1 : 0, focused ? 5 : 9, dt)
    const k = a.t < 0.002 ? 0 : a.t
    // From off to her right (or below, on a phone), turned away; settles turned a little toward her.
    const away = 1 - k
    g.position.set(
      f.panel.position[0] + (f.portrait ? 0 : away * 0.9),
      f.panel.position[1] - (f.portrait ? away * 0.9 : 0),
      f.panel.position[2] - away * 0.6,
    )
    g.rotation.set(f.portrait ? away * 0.5 : 0, turn - away * 0.7, 0)
    g.visible = k > 0
    edge[1].opacity = k

    css.obj.position.copy(g.position)
    css.obj.quaternion.copy(g.quaternion)
    css.obj.scale.setScalar(unit)
    css.el.style.opacity = String(Math.min(1, k * 1.25))
    css.el.style.pointerEvents = focused && k > 0.9 ? 'auto' : 'none'
    css.el.style.visibility = k > 0 ? 'visible' : 'hidden'
  })
  // After the WebGPU pipeline has drawn (priority 1), place the DOM layer for the same camera.
  useFrame(() => css.renderer.render(css.scene, camera), 2)

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={edge} />
    </group>
  )
}
