import { Canvas, extend, useFrame, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { say } from '@actora/options/run'
import { useStage } from '../look/layout'
import { damp } from '../look/motion'
import { Character } from './Character'
import { draftInput, useDraft } from './draft'
import { Environment } from './Environment'
import { AgentLine3D } from './panels/AgentLine3D'
import { ChatInput3D } from './panels/ChatInput3D'
import { Grid3D } from './panels/Grid3D'
import { OptionPills3D } from './panels/OptionPills3D'
import { Post } from './Post'

declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
// JSX elements (<mesh>, <meshStandardMaterial>, …) come from three/webgpu, so they're node materials.
extend(THREE as never)

const FOV = 38
const target = new THREE.Vector3()

/**
 * Frames the 2D stage at any aspect (wide screens fit its height, narrow ones its
 * width), with a little parallax from the pointer so the depth reads.
 */
function Rig() {
  const { frame } = useStage()
  useFrame(({ camera, size, pointer }, dt) => {
    const t = Math.tan(((FOV / 2) * Math.PI) / 180)
    const aspect = size.width / size.height
    const dist = Math.max(frame.h / 2 / t, frame.w / 2 / (t * aspect))
    target.x = damp(target.x, frame.center[0], 4, dt)
    target.y = damp(target.y, frame.center[1], 4, dt)
    camera.position.x = damp(camera.position.x, pointer.x * 0.18, 3, dt)
    camera.position.y = damp(camera.position.y, target.y + 0.08 + pointer.y * 0.1, 3, dt)
    camera.position.z = damp(camera.position.z, dist, 4, dt)
    camera.lookAt(target)
  })
  return null
}

export function World() {
  const { text } = useDraft()
  return (
    <>
      <Canvas
        shadows
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
        <Character />
        <AgentLine3D />
        <Grid3D />
        <OptionPills3D />
        <ChatInput3D />
      </Canvas>
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
