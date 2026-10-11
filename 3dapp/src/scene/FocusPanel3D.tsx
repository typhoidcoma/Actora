import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { useFocused } from '../look/focus'
import { FOCUS_RADIUS, useFocusHost } from '../look/focusHost'
import { focusLayout } from '../look/layout'
import { damp } from '../look/motion'

/**
 * The focus panel as a thing in the world. The 2D app's content (chat, item,
 * list, finds, vault) lives in a DOM element placed in the scene with CSS 3D
 * transforms that follow the camera, so it has perspective, parallax and turns
 * toward her. It flies in from her right and out again, content and glass together.
 */
export function FocusPanel3D() {
  const focused = useFocused()
  const { size, camera, gl } = useThree()
  // (castShadow on the body below: the panel shades the floor like the cards do.)
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
    </group>
  )
}
