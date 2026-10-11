import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { float, length, smoothstep, uniform, uv } from 'three/tsl'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { useAgent } from '@actora/stores/agent'
import { useScheme } from '@actora/stores/scheme'
import { moodIntensity, orbColors } from '@actora/ui/palette'
import { damp } from '../look/motion'
import { parseCss, useLook } from '../look/theme'
import { Sky } from './Sky'

/**
 * Light for the stage: a soft studio environment (so skin and glass have something
 * to reflect), a key light for her shadow, the sky's colour as fill, and her mood
 * as a rim light behind her and a pool of light at her feet, like MoodLight's spill.
 */
export function Environment() {
  const look = useLook()
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  const hemi = useRef<THREE.HemisphereLight>(null)
  const rim = useRef<THREE.PointLight>(null)
  const fog = useMemo(() => new THREE.Fog('#000', 7, 22), [])
  useEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])

  // The pool of mood light on the floor.
  const pool = useMemo(() => {
    const color = uniform(new THREE.Color())
    const strength = uniform(0.4)
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    m.colorNode = color
    m.opacityNode = smoothstep(float(0.5), float(0), length(uv().sub(0.5))).pow(1.6).mul(strength)
    return { m, color, strength }
  }, [])
  useEffect(() => () => pool.m.dispose(), [pool])

  const targets = useMemo(
    () => ({ fog: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), mood: new THREE.Color(), mood2: new THREE.Color() }),
    [],
  )
  useEffect(() => {
    parseCss(look.bg, targets.fog)
    parseCss(look.sky[0], targets.sky)
    parseCss(look.bg2, targets.ground)
    pool.m.blending = look.day ? THREE.NormalBlending : THREE.AdditiveBlending
  }, [look, targets, pool])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 2)
    const { mood, emotion, phase } = useAgent.getState()
    const offline = phase === 'offline'
    const [c1, c2] = orbColors(mood, emotion, useScheme.getState().scheme)
    targets.mood.setRGB(c1[0], c1[1], c1[2], THREE.SRGBColorSpace)
    targets.mood2.setRGB(c2[0], c2[1], c2[2], THREE.SRGBColorSpace)
    const glow = offline ? 0.1 : 0.3 + moodIntensity(mood, emotion) * 0.7

    fog.color.lerp(targets.fog, k)
    if (hemi.current) {
      hemi.current.color.lerp(targets.sky, k)
      hemi.current.groundColor.lerp(targets.ground, k)
    }
    if (rim.current) {
      rim.current.color.lerp(targets.mood, k)
      rim.current.intensity = damp(rim.current.intensity, 10 + glow * 30, 2, dt)
    }
    pool.color.value.lerp(targets.mood2, k)
    pool.strength.value = damp(pool.strength.value, (look.day ? 0.35 : 0.55) * glow, 2, dt)
  })

  return (
    <>
      <Sky />
      <hemisphereLight ref={hemi} intensity={look.day ? 1.2 : 0.7} />
      <directionalLight
        position={[2.5, 4.5, 3]}
        intensity={look.day ? 2.4 : 1.4}
        color={look.day ? '#fff6ea' : '#d9d6ff'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={6}
        shadow-bias={-0.0004}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-1}
      />
      <pointLight ref={rim} position={[0, 1.7, -1.1]} intensity={18} distance={6} />
      {/* Floor: invisible but for her shadow and the pool of mood light. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[5, 64]} />
        <shadowMaterial transparent opacity={look.day ? 0.18 : 0.35} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} material={pool.m}>
        <planeGeometry args={[3.2, 3.2]} />
      </mesh>
    </>
  )
}
