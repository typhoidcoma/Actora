import { Canvas, extend, useFrame, useThree, type ThreeToJSXElements } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { markReady, useReady } from '../look/ready'
import * as THREE from 'three/webgpu'
import { useFocused } from '../look/focus'
import { FOV, focusLayout, useStage } from '../look/layout'
import { UI_LAYER } from '../look/layers'
import { damp } from '../look/motion'
import { intro } from '../look/intro'
import { Character, herOffset } from './Character'
import { Environment } from './Environment'
import { AgentLine3D } from './panels/AgentLine3D'
import { Grid3D } from './panels/Grid3D'
import { FocusPanel3D } from './FocusPanel3D'
import { ui } from '@actora/stores/ui'
import { Overlay } from '../dom/Overlay'
import { Post } from './Post'
import { Pane } from './panels/Pane'
import { Anchor } from './Anchor'

declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
// JSX elements (<mesh>, <meshStandardMaterial>, …) come from three/webgpu, so they're node materials.
extend(THREE as never)

const target = new THREE.Vector3(0, 1.2, 0)
const still = new THREE.Vector2(0, 0)
const follow = { x: 0, z: 0 }
const zoom = { v: 1 }
const welcome = { k: 1 }

/**
 * Frames the 2D stage at any aspect (wide screens fit its height, narrow ones its
 * width), with a little parallax from the pointer so the depth reads. In focus
 * mode it comes in to her (waist up, on the left) and holds still, so the DOM
 * panel stays registered on the glass.
 */
function Rig() {
  const { frame, camera: fixed } = useStage()
  const focused = useFocused()
  useFrame(({ camera, size, pointer: p }, dt) => {
    const aspect = size.width / size.height
    // Phones hold the camera still: on touch, parallax only shifts the stack off the sides.
    const pointer = aspect < 0.8 ? still : p
    if (focused) {
      const f = focusLayout(aspect)
      target.x = damp(target.x, f.target[0], 3.2, dt)
      target.y = damp(target.y, f.target[1], 3.2, dt)
      target.z = damp(target.z, f.target[2], 3.2, dt)
      // Held still while reading: parallax here would tilt the panel's text.
      camera.position.x = damp(camera.position.x, f.target[0], 3.2, dt)
      camera.position.y = damp(camera.position.y, f.target[1], 3.2, dt)
      camera.position.z = damp(camera.position.z, f.target[2] + f.dist, 3.2, dt)
    } else if (fixed) {
      // Phones: a set camera, head and shoulders above the stack, with a touch of parallax.
      target.x = damp(target.x, fixed.target[0], 3, dt)
      target.y = damp(target.y, fixed.target[1], 3, dt)
      target.z = damp(target.z, fixed.target[2], 3, dt)
      camera.position.x = damp(camera.position.x, fixed.position[0] + pointer.x * 0.04, 3, dt)
      camera.position.y = damp(camera.position.y, fixed.position[1] + pointer.y * 0.03, 3, dt)
      camera.position.z = damp(camera.position.z, fixed.position[2], 3, dt)
    } else {
      const t = Math.tan(((FOV / 2) * Math.PI) / 180)
      // While she wanders, the camera pushes in on her (up to ~18%) and follows
      // most of her move, slowly, like a camera operator; it settles back after.
      // The welcome (look/intro.ts): pulled back on the room while she walks in, no
      // push-in or follow; it eases in to the usual view as she arrives.
      welcome.k = damp(welcome.k, intro.pending || intro.active ? 1 : 0, intro.pending ? 50 : 0.8, dt)
      const away = Math.min(1, Math.hypot(herOffset.x, herOffset.z) / 0.35) * (1 - welcome.k)
      // …and centres up on her as it comes in (her home spot is left of centre).
      const aimX = frame.center[0] + (herOffset.x - frame.center[0]) * away * 0.85
      follow.x = damp(follow.x, aimX - frame.center[0], 1.2, dt)
      follow.z = damp(follow.z, herOffset.z * 0.6, 1.2, dt)
      zoom.v = damp(zoom.v, 1 - away * 0.18, 0.9, dt)
      const dist = Math.max(frame.h / 2 / t, frame.w / 2 / (t * aspect)) * zoom.v * (1 + 0.55 * welcome.k)
      target.x = damp(target.x, frame.center[0] + follow.x, 3, dt)
      target.y = damp(target.y, frame.center[1], 3, dt)
      target.z = damp(target.z, frame.center[2] + follow.z, 3, dt)
      camera.position.x = damp(camera.position.x, frame.center[0] + follow.x + pointer.x * 0.18, 3, dt)
      // A little above her eye line, looking slightly down: the floor, steps and reflections read.
      camera.position.y = damp(camera.position.y, target.y + 0.42 + 0.35 * welcome.k + pointer.y * 0.1, 3, dt)
      camera.position.z = damp(camera.position.z, frame.center[2] + follow.z + dist, 3, dt)
    }
    camera.lookAt(target)
  })
  return null
}

/** Where the 2D rail (the glass option pills, chat, keyboard, menu) is pinned in the room. */
function RailAnchor() {
  const { rail, line } = useStage()
  return (
    <>
      <Anchor name="rail" position={rail.position} align="top" />
      {/* Her thinking (the 2D Activity) sits where her line does, over her head. */}
      <Anchor name="thinking" position={line.position} align="bottom" />
    </>
  )
}

/**
 * Once the character and the room's reflections are in, compiles every shader
 * up front (otherwise each one compiles the first time it's seen: the hitches),
 * then lets a few frames settle before the loader lifts.
 */
function Warmup() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const { model, env, compiled } = useReady()
  const frames = useRef(-1)
  useEffect(() => {
    if (!model || !env || compiled || frames.current >= 0) return
    frames.current = 0
    void gl.compileAsync(scene, camera).catch(() => {}).finally(() => (frames.current = 1))
  }, [gl, scene, camera, model, env, compiled])
  useFrame(() => {
    if (frames.current < 1) return
    if (++frames.current > 4) {
      frames.current = -2
      markReady('compiled')
    }
  })
  return null
}

/**
 * Under the loader, one glass panel and one bare text panel, so their shaders
 * compile before the reveal (the real cards then reuse them: no hitch as they
 * make their entrance). Gone once the scene is ready.
 */
function WarmPanes() {
  const ready = useReady((s) => s.ready)
  if (ready) return null
  const noop = () => {}
  return (
    <>
      <Pane width={0.2} height={0.1} position={[0, 1.2, 0.5]} paint={noop} deps={[]} />
      <Pane width={0.2} height={0.1} position={[0, 1.4, 0.5]} paint={noop} deps={[]} bare />
    </>
  )
}

/** The UI makes its entrance once the scene is ready (the loader fading over it). */
function Entrance() {
  const ready = useReady((s) => s.ready)
  if (!ready) return null
  return (
    <>
      <AgentLine3D />
      <Grid3D />
    </>
  )
}

/** She stands where the stage says. */
function Her() {
  const { her } = useStage()
  return (
    <group position={her}>
      <Character />
    </group>
  )
}

export function World() {
  return (
    <>
      <Canvas
        shadows
        // A tap on the scene itself (not a card or the panel) puts the open thing away.
        onPointerMissed={(e) => {
          // Only a tap on the scene itself (not on a panel or control laid over it).
          if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') ui.closeAll()
        }}
        camera={{ position: [0, 1.2, 5], fov: FOV }}
        onCreated={({ camera, raycaster }) => {
          // The camera and the pointer see the UI layer; the AO depth pass doesn't (Post).
          camera.layers.enable(UI_LAYER)
          raycaster.layers.enable(UI_LAYER)
        }}
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer({ ...(props as object), antialias: true })
          await renderer.init()
          return renderer
        }}
      >
        <Rig />
        <Post />
        <Environment />
        <Her />
        <WarmPanes />
        <Warmup />
        <Entrance />
        <RailAnchor />
        <FocusPanel3D />
      </Canvas>
      <Overlay />
    </>
  )
}
