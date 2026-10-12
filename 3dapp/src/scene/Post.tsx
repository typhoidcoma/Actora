import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { builtinAOContext, depthPass, mix, pass, screenUV, uniform } from 'three/tsl'
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js'
import { useFocused } from '../look/focus'
import { damp } from '../look/motion'
import { herOffset } from './Character'
import { intro } from '../look/intro'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { ao } from 'three/addons/tsl/display/GTAONode.js'

/**
 * The render pipeline: ambient occlusion folded into the indirect light (soft
 * contact shading on her and under her), then bloom for anything brighter than
 * white (the alarm glow, hot highlights), then Neutral tone mapping, which keeps
 * the brand colours true. Takes over rendering from R3F (useFrame priority 1).
 */
export function Post() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const aoCamera = useMemo(() => new THREE.PerspectiveCamera(), [])
  const focused = useFocused()
  // Depth of field for focus mode: focus held on her, the room behind her softening.
  // `amount` blends it in: at home the frame is the sharp one (the DOF pass composites
  // at reduced resolution, which softened the cards' type even at zero bokeh).
  const lens = useMemo(() => ({ focus: uniform(3), range: uniform(0.9), bokeh: uniform(3), amount: uniform(0) }), [])
  const her = useMemo(() => new THREE.Vector3(0, 1.5, 0), [])

  const pipeline = useMemo(() => {
    gl.toneMapping = THREE.NeutralToneMapping
    gl.toneMappingExposure = 1
    const pipeline = new THREE.RenderPipeline(gl)

    // Single-sampled: GTAO gathers from a plain depth texture, not a multisampled one.
    // It sees the room and her only (aoCamera has no UI layer), so floating cards
    // don't occlude what's behind them.
    const pre = depthPass(scene, aoCamera, { samples: 0 })
    // No normal pass: GTAO rebuilds normals from depth when given none (saves a
    // second full render of the glass); the typings just don't admit null.
    const occlusion = ao(pre.getTextureNode('depth'), null as never, camera)
    occlusion.resolutionScale = 0.5
    occlusion.radius.value = 0.3
    occlusion.thickness.value = 1

    const scenePass = pass(scene, camera)
    scenePass.contextNode = builtinAOContext(occlusion.getTextureNode().sample(screenUV).r)
    const color = scenePass.getTextureNode('output')
    const soft = dof(color, scenePass.getViewZNode(), lens.focus, lens.range, lens.bokeh) as unknown as typeof color
    const focusedColor = mix(color, soft, lens.amount)

    const glow = bloom(color, 0.45, 0.4, 1.05)
    pipeline.outputNode = focusedColor.add(glow)
    return pipeline
  }, [gl, scene, camera, aoCamera, lens])

  useEffect(() => () => pipeline.dispose(), [pipeline])
  useFrame((_, dt) => {
    // Focus on her wherever she is: her head in a close-up, her chest at home.
    her.set(herOffset.x, focused ? 1.5 : 1.25, herOffset.z)
    lens.focus.value = camera.position.distanceTo(her)
    // In focus mode, full depth of field; at home, a softer one while she's wandering
    // (the camera's following her then), none while she's at her spot.
    // No depth of field for the welcome walk-in: the whole room is the point then.
    const away = intro.pending || intro.active ? 0 : Math.min(1, Math.hypot(herOffset.x, herOffset.z) / 0.35)
    const want = focused ? 1 : away * 0.75
    lens.amount.value = damp(lens.amount.value, want, want > lens.amount.value ? 1.5 : 3, dt)
    // The AO depth pass follows the real camera exactly, minus the UI layer.
    aoCamera.copy(camera as THREE.PerspectiveCamera, false)
    aoCamera.layers.set(0)
    pipeline.render()
  }, 1)
  return null
}
