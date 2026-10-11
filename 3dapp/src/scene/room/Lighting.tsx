import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { ringing } from '@actora/aelora/protocol'
import { useAgent } from '@actora/stores/agent'
import { useEntities } from '@actora/stores/entities'
import { useScheme } from '@actora/stores/scheme'
import { moodIntensity, orbColors } from '@actora/ui/palette'
import { useNow } from '@actora/ui/tiles/data'
import { damp } from '../../look/motion'
import { parseCss, useLook } from '../../look/theme'
import type { RoomMaterials } from './materials'
import { ROOM } from './Room'

/** Where the sun comes from (toward the light), by theme: high and white by day, low and gold at dusk. */
const SUN = {
  day: { dir: new THREE.Vector3(-1, 0.95, 0.4).normalize(), color: new THREE.Color('#fff3e0'), intensity: 3.4 },
  dusk: { dir: new THREE.Vector3(-1, 0.3, 0.22).normalize(), color: new THREE.Color('#ffb067'), intensity: 3.1 },
}
const SUN_TARGET = new THREE.Vector3(1, 0, -1.5)
const WASH_X = [-1.6, 0.4, 2.4]

/** Is a reminder going off right now (the room breathes in the urgent colour)? */
function useAlarm(): boolean {
  const now = useNow(15_000)
  return useEntities((s) => Object.values(s.notifications).some((n) => ringing(n, now)))
}

/**
 * The room's light, tied to the 2D app's theming:
 * - time of day (the theme) moves the sun through the window wall: its angle,
 *   colour and the length of the mullion shadows across the floor;
 * - her mood colours the cove and the wash grazing the back wall;
 * - the scheme's accent lights the step nosings (colors.set recolours the room);
 * - a reminder going off makes the cove breathe in the urgent colour.
 * The polished floor's reflections are re-captured from the room when the look changes.
 */
export function Lighting({ mat }: { mat: RoomMaterials }) {
  const look = useLook()
  const alarm = useAlarm()
  const { gl, scene } = useThree()
  const renderer = gl as unknown as THREE.WebGPURenderer

  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const washes = useRef<Array<THREE.SpotLight | null>>([])
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(SUN_TARGET)
    return o
  }, [])
  const washTargets = useMemo(
    () =>
      WASH_X.map((x) => {
        const o = new THREE.Object3D()
        o.position.set(x, 0.8, ROOM.back)
        return o
      }),
    [],
  )

  const to = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      sunColor: new THREE.Color(),
      sky: new THREE.Color(),
      ground: new THREE.Color(),
      mood: new THREE.Color(),
      accent: new THREE.Color(),
      urgent: new THREE.Color(),
    }),
    [],
  )
  useEffect(() => {
    parseCss(look.sky[0], to.sky)
    parseCss('#b9a68e', to.ground)
    parseCss(look.role.accent, to.accent)
    parseCss(look.role.urgent, to.urgent)
  }, [look, to])

  // Fog the far end a touch in the theme's air.
  const fog = useMemo(() => new THREE.Fog('#000', 16, 46), [])
  useEffect(() => {
    scene.fog = fog
    parseCss(look.bg, fog.color)
    return () => {
      scene.fog = null
    }
  }, [scene, fog, look.bg])

  // Reflections: capture the room into an environment map once the look settles.
  // Keyed on a stable string (look.sky is a fresh array every render: keying on it
  // re-captured constantly), and the old map is only released after the new one
  // is in place, so there's never a frame without reflections (the flicker).
  const envKey = `${look.day}|${look.skyKind}|${look.sky.join(',')}`
  const pmrem = useMemo(() => new THREE.PMREMGenerator(renderer), [renderer])
  useEffect(() => () => pmrem.dispose(), [pmrem])
  useEffect(() => {
    const t = setTimeout(() => {
      const prev = scene.environment
      scene.environment = pmrem.fromScene(scene, 0.035, 0.1, 60, { position: new THREE.Vector3(0, 1.6, 2.5) }).texture
      scene.environmentIntensity = 0.75
      prev?.dispose()
    }, 1600)
    return () => clearTimeout(t)
  }, [pmrem, scene, envKey])

  const first = useRef(true)
  useFrame(({ clock }, dt) => {
    const k = first.current ? 1 : 1 - Math.exp(-dt * 1.6)
    first.current = false
    const s = look.day ? SUN.day : SUN.dusk

    if (sun.current) {
      to.dir.copy(s.dir)
      const p = sun.current.position.clone().sub(SUN_TARGET).normalize().lerp(to.dir, k).normalize()
      sun.current.position.copy(SUN_TARGET).addScaledVector(p, 18)
      sun.current.color.lerp(s.color, k)
      sun.current.intensity = damp(sun.current.intensity, s.intensity, 1.6, dt)
    }
    if (hemi.current) {
      hemi.current.color.lerp(to.sky, k)
      hemi.current.groundColor.lerp(to.ground, k)
      hemi.current.intensity = damp(hemi.current.intensity, look.day ? 0.55 : 0.22, 1.6, dt)
    }

    // Her mood: the cove and the wall wash.
    const { mood, emotion, phase } = useAgent.getState()
    const offline = phase === 'offline'
    const [c1] = orbColors(mood, emotion, useScheme.getState().scheme)
    to.mood.setRGB(c1[0], c1[1], c1[2], THREE.SRGBColorSpace)
    // Keep the room warm: her colour tints a warm white rather than replacing it.
    to.mood.lerp(new THREE.Color('#ffd7a3'), 0.45)
    const glow = offline ? 0.15 : 0.45 + moodIntensity(mood, emotion) * 0.55
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.2)

    const coveColor = alarm ? to.urgent : to.mood
    mat.cove.color.value.lerp(coveColor, alarm ? 1 - Math.exp(-dt * 8) : k)
    const coveTarget = (look.day ? 1.6 : 3.2) * glow * (alarm ? 0.8 + pulse * 0.7 : 1)
    mat.cove.strength.value = damp(mat.cove.strength.value, coveTarget, alarm ? 12 : 2, dt)

    for (const w of washes.current) {
      if (!w) continue
      w.color.lerp(to.mood, k)
      w.intensity = damp(w.intensity, (look.day ? 14 : 30) * glow, 2, dt)
    }

    // The scheme's accent on the step nosings.
    mat.accent.color.value.lerp(to.accent, k)
    mat.accent.strength.value = damp(mat.accent.strength.value, look.day ? 0.55 : 1.3, 2, dt)
  })

  return (
    <>
      <primitive object={target} />
      {washTargets.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
      <directionalLight
        ref={sun}
        target={target}
        position={[-14, 14, 6]}
        intensity={3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={45}
      />
      <hemisphereLight ref={hemi} intensity={0.4} />
      {WASH_X.map((x, i) => (
        <spotLight
          key={x}
          ref={(l) => {
            washes.current[i] = l
          }}
          target={washTargets[i]}
          position={[x, ROOM.height - 0.3, ROOM.back + 0.7]}
          angle={0.62}
          penumbra={0.95}
          distance={12}
          decay={1.6}
          intensity={20}
        />
      ))}
    </>
  )
}
