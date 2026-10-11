import { Canvas, extend, useFrame, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useFocused } from '../look/focus'
import { FOV, focusLayout, useStage } from '../look/layout'
import { UI_LAYER } from '../look/layers'
import { damp } from '../look/motion'
import { Character } from './Character'
import { Environment } from './Environment'
import { AgentLine3D } from './panels/AgentLine3D'
import { Grid3D } from './panels/Grid3D'
import { FocusPanel3D } from './FocusPanel3D'
import { ui } from '@actora/stores/ui'
import { Overlay } from '../dom/Overlay'
import { Post } from './Post'
import { Anchor } from './Anchor'

declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
// JSX elements (<mesh>, <meshStandardMaterial>, …) come from three/webgpu, so they're node materials.
extend(THREE as never)

const target = new THREE.Vector3(0, 1.2, 0)
const still = new THREE.Vector2(0, 0)

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
      camera.position.x = damp(camera.position.x, f.target[0] + pointer.x * 0.06, 3.2, dt)
      camera.position.y = damp(camera.position.y, f.target[1] + pointer.y * 0.04, 3.2, dt)
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
      const dist = Math.max(frame.h / 2 / t, frame.w / 2 / (t * aspect))
      target.x = damp(target.x, frame.center[0], 3, dt)
      target.y = damp(target.y, frame.center[1], 3, dt)
      target.z = damp(target.z, frame.center[2], 3, dt)
      camera.position.x = damp(camera.position.x, frame.center[0] + pointer.x * 0.18, 3, dt)
      // A little above her eye line, looking slightly down: the floor, steps and reflections read.
      camera.position.y = damp(camera.position.y, target.y + 0.42 + pointer.y * 0.1, 3, dt)
      camera.position.z = damp(camera.position.z, dist, 3, dt)
    }
    camera.lookAt(target)
  })
  return null
}

/** Where the 2D rail (the glass option pills, chat, keyboard, menu) is pinned in the room. */
function RailAnchor() {
  const { chips, line } = useStage()
  return (
    <>
      <Anchor name="rail" position={chips.position} align="top" />
      {/* Her thinking (the 2D Activity) sits where her line does, over her head. */}
      <Anchor name="thinking" position={line.position} align="bottom" />
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
        <AgentLine3D />
        <Grid3D />
        <RailAnchor />
        <FocusPanel3D />
      </Canvas>
      <Overlay />
    </>
  )
}
