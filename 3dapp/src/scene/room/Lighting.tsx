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
  dusk: { dir: new THREE.Vector3(-1, 0.3, 0.22).normalize(), color: new THREE.Color('#ffc38a'), intensity: 2.6 },
}
const SUN_TARGET = new THREE.Vector3(1, 0, -1.5)
const WASH_X = [-1.6, 0.4, 2.4]
/** Interior architectural light: warm white, about 3000 K. */
const WARM = new THREE.Color('#ffd9ae')

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
  const key = useRef<THREE.SpotLight>(null)
  const keyTarget = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0, 1.25, 0)
    return o
  }, [])
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
      fog: new THREE.Color(),
      mood: new THREE.Color(),
      accent: new THREE.Color(),
      urgent: new THREE.Color(),
    }),
    [],
  )
  useEffect(() => {
    parseCss(look.role.accent, to.accent)
    parseCss(look.role.urgent, to.urgent)
    parseCss(look.bg, to.fog)
  }, [look, to])

  // Fog the far end a touch in the theme's air (eased in the frame loop, never snapped).
  const fog = useMemo(() => new THREE.Fog('#000', 16, 46), [])
  useEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])

  // Reflections: the room captured into an environment map ONCE, with the sun off,
  // so it holds the room's own neutral light and doesn't depend on the time of day
  // (the sun and lights carry that live). A capture renders the room six times
  // with shadows: re-capturing during a theme change ran at ~6 fps.
  const pmrem = useMemo(() => new THREE.PMREMGenerator(renderer), [renderer])
  useEffect(() => () => pmrem.dispose(), [pmrem])
  useEffect(() => {
    const t = setTimeout(() => {
      const s = sun.current
      const was = s?.intensity ?? 0
      if (s) s.intensity = 0
      const prev = scene.environment
      scene.environment = pmrem.fromScene(scene, 0.035, 0.1, 60, { position: new THREE.Vector3(0, 1.6, 2.5) }).texture
      prev?.dispose()
      if (s) s.intensity = was
    }, 1200)
    return () => clearTimeout(t)
  }, [pmrem, scene])

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
    // Reflections of the room's own light: brighter by day, quieter at dusk.
    scene.environmentIntensity = damp(scene.environmentIntensity, look.day ? 0.7 : 0.35, 1.6, dt)
    // Fill: neutral warm-white bounce, not the weather's colours (they cast odd tints on the room).
    if (hemi.current) hemi.current.intensity = damp(hemi.current.intensity, look.day ? 0.6 : 0.3, 1.6, dt)
    fog.color.lerp(to.fog, k)
    if (key.current) key.current.intensity = damp(key.current.intensity, look.day ? 5 : 11, 1.6, dt)

    // Her mood: the cove and the wall wash.
    const { mood, emotion, phase } = useAgent.getState()
    const offline = phase === 'offline'
    const [c1] = orbColors(mood, emotion, useScheme.getState().scheme)
    to.mood.setRGB(c1[0], c1[1], c1[2], THREE.SRGBColorSpace)
    // Architectural light is warm white (about 3000 K); her mood only tints it.
    to.mood.lerp(WARM, 0.78)
    const glow = offline ? 0.15 : 0.45 + moodIntensity(mood, emotion) * 0.55
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.2)

    const coveColor = alarm ? to.urgent : to.mood
    mat.cove.color.value.lerp(coveColor, alarm ? 1 - Math.exp(-dt * 8) : k)
    const coveTarget = (look.day ? 1.2 : 2.4) * (0.7 + glow * 0.3) * (alarm ? 0.8 + pulse * 0.7 : 1)
    mat.cove.strength.value = damp(mat.cove.strength.value, coveTarget, alarm ? 12 : 2, dt)

    for (const w of washes.current) {
      if (!w) continue
      w.color.lerp(to.mood, k)
      w.intensity = damp(w.intensity, (look.day ? 10 : 24) * (0.7 + glow * 0.3), 1.6, dt)
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
      <hemisphereLight ref={hemi} args={['#fff3e4', '#cdbfae', 0.4]} />
      {/* A soft warm key on her from above the camera, so she reads in any light. */}
      <primitive object={keyTarget} />
      <spotLight ref={key} target={keyTarget} position={[0.9, 4.2, 3.6]} angle={0.42} penumbra={1} decay={1.4} distance={14} color="#ffe3c2" intensity={6} />
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
