import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { ringing } from '@actora/aelora/protocol'
import { useAgent } from '@actora/stores/agent'
import { useUi } from '@actora/stores/ui'
import { useSky } from '@actora/weather/sky'
import { useEntities } from '@actora/stores/entities'
import { useScheme } from '@actora/stores/scheme'
import { moodIntensity, orbColors } from '@actora/ui/palette'
import { useNow } from '@actora/ui/tiles/data'
import { damp } from '../../look/motion'
import { markReady } from '../../look/ready'
import { parseCss, useLook } from '../../look/theme'
import type { RoomMaterials } from './materials'
import { ROOM } from './Room'
import { pcssFilter } from './pcss'

/** The sun's shadow camera: the whole room, from 1 m to 45 m out along its rays. */
const SHADOW = { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 45 }
/** Contact-hardening soft shadows (pcss.ts), for the sun. */
const SUN_SHADOW = pcssFilter({ width: SHADOW.right - SHADOW.left, depth: SHADOW.far - SHADOW.near })
/** About 5 mm a texel on a desktop GPU; phones keep the lighter map. */
const SHADOW_MAP = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 2048 : 4096

/** Where the sun comes from (toward the light), by theme: high and white by day, low and gold at dusk. */
const SUN = {
  day: { dir: new THREE.Vector3(-1, 0.95, 0.4).normalize(), color: new THREE.Color('#fff3e0'), intensity: 3.4 },
  dusk: { dir: new THREE.Vector3(-1, 0.3, 0.22).normalize(), color: new THREE.Color('#ffc38a'), intensity: 2.6 },
}
const SUN_TARGET = new THREE.Vector3(1, 0, -1.5)
const NOON = new THREE.Color('#fff3e0')
const LOW = new THREE.Color('#ffb067')

/** Minutes past local midnight of "YYYY-MM-DDTHH:MM" (Open-Meteo's sunrise/sunset), or null. */
const minuteOf = (iso?: string | null): number | null => {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Where the real sun is right now, for "follows the sun": its arc through the
 * window wall from today's sunrise to sunset at the user's location (or 6:00 to
 * 19:00 without a forecast). Low and gold at the ends of the day, high and white
 * at noon, gone at night (the room is on its own lights then).
 */
function realSun(out: { dir: THREE.Vector3; color: THREE.Color; intensity: number }, now = new Date()) {
  const sky = useSky.getState()
  const rise = minuteOf(sky.sunrise) ?? 360
  const set = minuteOf(sky.sunset) ?? 1140
  const t = (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 - rise) / Math.max(60, set - rise)
  const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
  // Morning from the front of the window wall, evening from its far end.
  out.dir.set(-1, 0.12 + arc * 0.95, 0.65 - Math.min(1, Math.max(0, t)) * 1.2).normalize()
  out.color.copy(LOW).lerp(NOON, Math.min(1, arc * 1.6))
  // Fades in after sunrise and out before sunset (about 25 minutes of twilight each side).
  const edge = Math.min(1, Math.max(0, Math.min(t, 1 - t) * ((set - rise) / 25)))
  out.intensity = edge * (2.4 + arc * 1.0)
}
const WASH_X = [-1.6, 0.4, 2.4]
/** Interior architectural light: warm white, about 3000 K. */
const WARM = new THREE.Color('#ffd9ae')
const SKY_FILL = new THREE.Color('#fff3e4')
const GROUND_FILL = new THREE.Color('#cdbfae')

/**
 * A colour scheme the agent chose is the room's, as it is the 2D app's: its
 * surface hue paints the room (still light, like the 2D backgrounds), its ambient
 * colours (the 2D background blobs) are the washes on the back wall, and its
 * accent tints the sun, the fill and the cove. The brand keeps the room's
 * natural warm light and plain white.
 */
const THEMED = { sun: 0.42, sky: 0.4, ground: 0.25, wash: 0.75, cove: 0.55 }
const PLAIN = new THREE.Color('#cccccc')
const hsl = { h: 0, s: 0, l: 0 }
/** A colour as light: its hue, bright and saturated enough to read, never neon. */
function lightTint(css: string, out: THREE.Color): THREE.Color {
  parseCss(css, out).color.getHSL(hsl, THREE.SRGBColorSpace)
  return out.setHSL(hsl.h, Math.min(0.85, Math.max(0.45, hsl.s)), 0.68, THREE.SRGBColorSpace)
}
/** The room's paint in a hue: the same 80% light, with a gentle tint of it. */
function paintIn(css: string, out: THREE.Color): THREE.Color {
  parseCss(css, out).color.getHSL(hsl, THREE.SRGBColorSpace)
  return out.setHSL(hsl.h, Math.min(0.32, Math.max(0.12, hsl.s * 0.4)), 0.8, THREE.SRGBColorSpace)
}

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
 * - a reminder going off makes the cove breathe in the urgent colour.
 * The floor's reflections are captured once, from the room's own light (the sun off).
 */
export function Lighting({ mat }: { mat: RoomMaterials }) {
  const look = useLook()
  const alarm = useAlarm()
  const custom = useScheme((s) => (s.source === 'agent' ? s.scheme : null))
  const themed = custom !== null
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
      urgent: new THREE.Color(),
      tint: new THREE.Color(),
      sky: new THREE.Color(),
      ground: new THREE.Color(),
      wash: new THREE.Color(),
      paint: new THREE.Color(),
      /** One per wall wash: the scheme's ambient colours, or null for her mood. */
      washes: WASH_X.map(() => new THREE.Color()),
      ambient: false,
    }),
    [],
  )
  useEffect(() => {
    parseCss(look.role.urgent, to.urgent)
    parseCss(look.bg, to.fog)
    lightTint(look.role.accent, to.tint)
    to.sky.copy(SKY_FILL).lerp(to.tint, themed ? THEMED.sky : 0)
    to.ground.copy(GROUND_FILL).lerp(to.tint, themed ? THEMED.ground : 0)
    if (custom) paintIn(custom.neutral, to.paint)
    else to.paint.copy(PLAIN)
    const ambient = custom?.[look.day ? 'day' : 'dusk'].ambient ?? null
    to.ambient = !!ambient
    if (ambient) to.washes.forEach((c, i) => lightTint(ambient[i % ambient.length], c))
  }, [look, to, themed, custom])

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
      markReady('env')
    }, 600)
    return () => clearTimeout(t)
  }, [pmrem, scene])

  const live = useMemo(() => ({ dir: new THREE.Vector3(), color: new THREE.Color(), intensity: 0 }), [])
  // The real sun moves a degree in four minutes: recomputed once a second, not per frame.
  const sunAt = useRef(-Infinity)
  const scratch = useMemo(() => new THREE.Vector3(), [])
  // Her mood's colour and strength, recomputed only when the mood, the emotion or the scheme changes.
  const moodMemo = useRef<{ mood: unknown; emotion: unknown; scheme: unknown; c1: [number, number, number]; intensity: number } | null>(null)
  const first = useRef(true)
  useFrame(({ clock }, dt) => {
    const k = first.current ? 1 : 1 - Math.exp(-dt * 1.6)
    first.current = false
    // Following the sun: the real one. A chosen Day or Dusk keeps its fixed look.
    const auto = useUi.getState().theme === 'auto'
    if (auto && clock.elapsedTime - sunAt.current >= 1) {
      sunAt.current = clock.elapsedTime
      realSun(live)
    }
    const s = auto ? live : look.day ? SUN.day : SUN.dusk

    if (sun.current) {
      to.dir.copy(s.dir)
      const p = scratch.copy(sun.current.position).sub(SUN_TARGET).normalize().lerp(to.dir, k).normalize()
      sun.current.position.copy(SUN_TARGET).addScaledVector(p, 18)
      to.sunColor.copy(s.color).lerp(to.tint, themed ? THEMED.sun : 0)
      sun.current.color.lerp(to.sunColor, k)
      sun.current.intensity = damp(sun.current.intensity, s.intensity, 1.6, dt)
    }
    // Reflections of the room's own light: brighter by day, quieter at dusk.
    scene.environmentIntensity = damp(scene.environmentIntensity, look.day ? 0.7 : 0.35, 1.6, dt)
    // Fill: neutral warm-white bounce, not the weather's colours (they cast odd tints on the room).
    if (hemi.current) {
      hemi.current.intensity = damp(hemi.current.intensity, look.day ? 0.6 : 0.3, 1.6, dt)
      hemi.current.color.lerp(to.sky, k)
      hemi.current.groundColor.lerp(to.ground, k)
    }
    // The floor's mirror: a little stronger at dusk, when the room's lights are what it shows.
    mat.floorReflection.strength.value = damp(mat.floorReflection.strength.value, look.day ? 0.2 : 0.3, 1.6, dt)
    fog.color.lerp(to.fog, k)
    if (key.current) key.current.intensity = damp(key.current.intensity, look.day ? 5 : 11, 1.6, dt)

    // Her mood: the cove and the wall wash.
    const { mood, emotion, phase } = useAgent.getState()
    const offline = phase === 'offline'
    const scheme = useScheme.getState().scheme
    let mm = moodMemo.current
    if (!mm || mm.mood !== mood || mm.emotion !== emotion || mm.scheme !== scheme) {
      const [c1] = orbColors(mood, emotion, scheme)
      mm = moodMemo.current = { mood, emotion, scheme, c1: [c1[0], c1[1], c1[2]], intensity: moodIntensity(mood, emotion) }
    }
    const c1 = mm.c1
    to.mood.setRGB(c1[0], c1[1], c1[2], THREE.SRGBColorSpace)
    // Architectural light is warm white (about 3000 K); her mood only tints it,
    // and a chosen scheme leads it.
    if (themed) to.mood.lerp(to.tint, THEMED.wash).lerp(WARM, 0.45)
    else to.mood.lerp(WARM, 0.78)
    const glow = offline ? 0.15 : 0.45 + mm.intensity * 0.55
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.2)

    const coveColor = alarm ? to.urgent : themed ? to.wash.copy(to.mood).lerp(to.tint, THEMED.cove) : to.mood
    mat.cove.color.value.lerp(coveColor, alarm ? 1 - Math.exp(-dt * 8) : k)
    const coveTarget = (look.day ? 1.2 : 2.4) * (0.7 + glow * 0.3) * (alarm ? 0.8 + pulse * 0.7 : 1)
    mat.cove.strength.value = damp(mat.cove.strength.value, coveTarget, alarm ? 12 : 2, dt)

    // The room's paint, eased like the 2D colours.
    for (const m of [mat.wall, mat.floor, mat.column, mat.step, mat.wood]) m.color.lerp(to.paint, k)

    for (let i = 0; i < washes.current.length; i++) {
      const w = washes.current[i]
      if (!w) continue
      // The scheme's ambient colours, warmed a touch by her mood; else her mood.
      w.color.lerp(to.ambient ? to.wash.copy(to.washes[i]).lerp(to.mood, 0.2) : to.mood, k)
      w.intensity = damp(w.intensity, (look.day ? 10 : 24) * (0.7 + glow * 0.3), 1.6, dt)
    }

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
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-filterNode={SUN_SHADOW.filter}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={SHADOW.left}
        shadow-camera-right={SHADOW.right}
        shadow-camera-top={SHADOW.top}
        shadow-camera-bottom={SHADOW.bottom}
        shadow-camera-near={SHADOW.near}
        shadow-camera-far={SHADOW.far}
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
