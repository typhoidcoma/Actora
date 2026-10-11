import { Canvas, extend, useFrame, useThree, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { say } from '@actora/options/run'
import { Character } from './Character'
import { draftInput, useDraft } from './draft'
import { Environment } from './Environment'
import { AgentLine3D } from './panels/AgentLine3D'
import { ChatInput3D } from './panels/ChatInput3D'
import { OptionPills3D } from './panels/OptionPills3D'
import { Priorities3D } from './panels/Priorities3D'
import { Post } from './Post'

declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
// JSX elements (<mesh>, <meshStandardMaterial>, …) come from three/webgpu, so they're node materials.
extend(THREE as never)

const LOOK = new THREE.Vector3(0.25, 1.15, 0)

/** Pulls the camera back on narrow screens so the cards and pills stay in frame. */
function Rig() {
  const aspect = useThree((s) => s.size.width / s.size.height)
  useFrame(({ camera }) => {
    const z = aspect < 1 ? 3.8 / Math.max(aspect, 0.45) : 3.8
    camera.position.z += (z - camera.position.z) * 0.1
    camera.lookAt(LOOK)
  })
  return null
}

export function World() {
  const { text } = useDraft()
  return (
    <>
      <Canvas
        shadows
        camera={{ position: [0.25, 1.45, 3.8], fov: 42 }}
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
        <Priorities3D />
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
