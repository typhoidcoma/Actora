import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { builtinAOContext, depthPass, pass, screenUV } from 'three/tsl'
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

  const pipeline = useMemo(() => {
    gl.toneMapping = THREE.NeutralToneMapping
    gl.toneMappingExposure = 1
    const pipeline = new THREE.RenderPipeline(gl)

    const pre = depthPass(scene, camera)
    // No normal pass: GTAO rebuilds normals from depth when given none (saves a
    // second full render of the glass); the typings just don't admit null.
    const occlusion = ao(pre.getTextureNode('depth'), null as never, camera)
    occlusion.resolutionScale = 0.5
    occlusion.radius.value = 0.3
    occlusion.thickness.value = 1

    const scenePass = pass(scene, camera)
    scenePass.contextNode = builtinAOContext(occlusion.getTextureNode().sample(screenUV).r)
    const color = scenePass.getTextureNode('output')

    const glow = bloom(color, 0.75, 0.45, 1)
    pipeline.outputNode = color.add(glow)
    return pipeline
  }, [gl, scene, camera])

  useEffect(() => () => pipeline.dispose(), [pipeline])
  useFrame(() => pipeline.render(), 1)
  return null
}
