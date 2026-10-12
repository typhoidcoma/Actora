import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { useFocused } from '../look/focus'
import { FOCUS_RADIUS, useFocusHost } from '../look/focusHost'
import { focusLayout } from '../look/layout'
import { useReady } from '../look/ready'
import { UI_LAYER } from '../look/layers'
import { damp } from '../look/motion'
import { parseCss, useLook } from '../look/theme'
import { float, mix, uniform, vec4, viewportSharedTexture } from 'three/tsl'
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js'
import { roundedRect } from './panels/Pane'

/**
 * The focus panel as a thing in the world. The 2D app's content (chat, item,
 * list, finds, vault) lives in a DOM element placed in the scene with CSS 3D
 * transforms that follow the camera, so it has perspective, parallax and turns
 * toward her. Behind it WebGPU draws the glass the cards and pills are made of
 * (the room, blurred, under the 2D reading-surface tint), since browsers drop
 * backdrop-filter in 3D; the 2D panel's own fill is cleared (styles.css). It
 * flies in from her right and out again, content and glass together.
 */
export function FocusPanel3D() {
  const focused = useFocused()
  const { size, camera, gl } = useThree()
  const look = useLook()
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
    // On <body>, outside the canvas's event area: inside it, every click in the panel
    // also reached the scene as a tap on empty space, which closed the panel.
    document.body.appendChild(css.renderer.domElement)
    // Browsers don't route wheel scrolling into CSS-3D-transformed content (the
    // compositor misses it), so the panel scrolls its own lists: the nearest
    // scrollable element under the pointer that can still move that way.
    const onWheel = (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY
      for (let el = e.target as HTMLElement | null; el && el !== css.el.parentElement; el = el.parentElement) {
        if (el.scrollHeight <= el.clientHeight + 1) continue
        const oy = getComputedStyle(el).overflowY
        if (!/(auto|scroll)/.test(oy) || el.scrollHeight <= el.clientHeight + 1) continue
        const max = el.scrollHeight - el.clientHeight
        if ((dy < 0 && el.scrollTop <= 0) || (dy > 0 && el.scrollTop >= max - 1)) continue
        el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + dy))
        e.preventDefault()
        return
      }
    }
    css.el.addEventListener('wheel', onWheel, { passive: false })
    useFocusHost.setState({ el: css.el })
    return () => {
      css.el.removeEventListener('wheel', onWheel)
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
  // The glass: same pose and size as the DOM panel.
  const glassGeo = useMemo(() => roundedRect(f.panel.w, f.panel.h, FOCUS_RADIUS * unit), [f.panel.w, f.panel.h, unit])
  useEffect(() => () => glassGeo.dispose(), [glassGeo])
  const u = useMemo(() => ({ tint: uniform(new THREE.Color()), amount: uniform(0.84), appear: uniform(0) }), [])
  const glass = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
    const behind = hashBlur(viewportSharedTexture(), float(0.03), { repeats: float(28) })
    m.colorNode = vec4(mix(behind.rgb, u.tint, u.amount), 1)
    m.opacityNode = u.appear
    return m
  }, [u])
  useEffect(() => () => glass.dispose(), [glass])
  // --t-glass-thick: the 2D reading-surface glass, a little more see-through here so
  // the room still reads through it like the cards. Eased, so a theme change fades.
  const tintTo = useMemo(() => ({ color: new THREE.Color(), amount: 0.84 }), [])
  useEffect(() => {
    const { color, alpha } = parseCss(look.glassThick)
    tintTo.color.copy(color)
    tintTo.amount = Math.min(0.9, alpha * 0.9)
  }, [look.glassThick, tintTo])

  const anim = useRef({ t: 0 })
  // Settled, it faces the camera squarely: turned even a little, the close camera's
  // perspective keystones it (the far side looms, every line of text slopes).
  // The turn is only in the flight in and out.
  const turn = 0
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
    // Drawn (at zero opacity) until the scene is ready, so its glass shader compiles
    // under the loader, not as the camera first comes in.
    g.visible = k > 0 || !useReady.getState().ready
    u.appear.value = Math.min(1, k * 1.25)
    u.tint.value.lerp(tintTo.color, 1 - Math.exp(-dt * 2.5))
    u.amount.value = damp(u.amount.value, tintTo.amount, 2.5, dt)

    css.obj.position.copy(g.position)
    css.obj.quaternion.copy(g.quaternion)
    css.obj.scale.setScalar(unit)
    const opacity = String(Math.round(Math.min(1, k * 1.25) * 1000) / 1000)
    const pointer = focused && k > 0.9 ? 'auto' : 'none'
    const visibility = k > 0 ? 'visible' : 'hidden'
    const st = css.el.style
    if (st.opacity !== opacity) st.opacity = opacity
    if (st.pointerEvents !== pointer) st.pointerEvents = pointer
    if (st.visibility !== visibility) st.visibility = visibility
    hidden.current = k === 0
  })
  // After the WebGPU pipeline has drawn (priority 1), place the DOM layer for the same camera.
  // Placed for the same camera after the WebGPU pipeline draws; once hidden, rendered
  // one last time (to hide it) and then left alone until it shows again.
  const hidden = useRef(false)
  const renderedHidden = useRef(false)
  useFrame(() => {
    if (hidden.current && renderedHidden.current) return
    css.renderer.render(css.scene, camera)
    renderedHidden.current = hidden.current
  }, 2)

  return (
    <group ref={group} visible={false}>
      <mesh geometry={glassGeo} material={glass} layers={UI_LAYER} renderOrder={3} />
    </group>
  )
}
