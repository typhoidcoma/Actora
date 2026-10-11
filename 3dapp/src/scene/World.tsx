import { Canvas, extend, useFrame, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { say } from '@actora/options/run'
import { useFocused } from '../look/focus'
import { FOV, focusLayout, useStage } from '../look/layout'
import { damp } from '../look/motion'
import { Character } from './Character'
import { draftInput, useDraft } from './draft'
import { Environment } from './Environment'
import { AgentLine3D } from './panels/AgentLine3D'
import { ChatInput3D } from './panels/ChatInput3D'
import { Grid3D } from './panels/Grid3D'
import { OptionPills3D } from './panels/OptionPills3D'
import { FocusPanel3D } from './FocusPanel3D'
import { ui } from '@actora/stores/ui'
import { Overlay } from '../dom/Overlay'
import { Post } from './Post'

declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
// JSX elements (<mesh>, <meshStandardMaterial>, …) come from three/webgpu, so they're node materials.
extend(THREE as never)

const target = new THREE.Vector3(0, 1.2, 0)

/**
 * Frames the 2D stage at any aspect (wide screens fit its height, narrow ones its
 * width), with a little parallax from the pointer so the depth reads. In focus
 * mode it comes in to her (waist up, on the left) and holds still, so the DOM
 * panel stays registered on the glass.
 */
function Rig() {
  const { frame, camera: fixed } = useStage()
  const focused = useFocused()
  useFrame(({ camera, size, pointer }, dt) => {
    const aspect = size.width / size.height
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
      camera.position.x = damp(camera.position.x, pointer.x * 0.18, 3, dt)
      // A little above her eye line, looking slightly down: the floor, steps and reflections read.
      camera.position.y = damp(camera.position.y, target.y + 0.42 + pointer.y * 0.1, 3, dt)
      camera.position.z = damp(camera.position.z, dist, 3, dt)
    }
    camera.lookAt(target)
  })
  return null
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
  const { text } = useDraft()
  return (
    <>
      <Canvas
        shadows
        // A tap on the scene itself (not a card or the panel) puts the open thing away.
        onPointerMissed={() => ui.closeAll()}
        camera={{ position: [0, 1.2, 5], fov: FOV }}
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
        <OptionPills3D />
        <ChatInput3D />
        <FocusPanel3D />
      </Canvas>
      <Overlay />
      <input
        ref={draftInput}
        className="draft"
        aria-label="Message"
        value={text}
        onChange={(e) => useDraft.setState({ text: e.target.value })}
        onFocus={() => useDraft.setState({ focused: true })}
        onBlur={() => useDraft.setState({ focused: false })}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !text.trim()) return
          if (say(text.trim())) useDraft.setState({ text: '' })
        }}
      />
    </>
  )
}
