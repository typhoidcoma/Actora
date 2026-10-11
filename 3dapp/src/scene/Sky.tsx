import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { dot, mix, normalize, positionLocal, smoothstep, uniform, vec3 } from 'three/tsl'
import { watchSky } from '@actora/weather/sky'
import { damp } from '../look/motion'
import { parseCss, useLook } from '../look/theme'

/** Where each blob drifts on the dome: centre (azimuth, elevation, radians), sway, period (s). */
const DRIFT = [
  { az: -0.75, el: 0.35, sway: 0.35, period: 46 },
  { az: 0.7, el: 0.15, sway: 0.4, period: 38 },
  { az: -0.1, el: -0.15, sway: 0.3, period: 54 },
  { az: 0.25, el: 0.6, sway: 0.25, period: 31 },
]

/**
 * The 2D app's ambient weather field, as the world around her: the same four
 * weather colours (or the agent's own) drifting as soft light on a dome over the
 * theme's background, cross-fading when the weather, theme or scheme changes.
 */
export function Sky() {
  const look = useLook()
  useEffect(() => watchSky(), [])

  const u = useMemo(() => {
    const bg = uniform(new THREE.Color())
    const low = uniform(new THREE.Color())
    const blobs = DRIFT.map(() => ({
      color: uniform(new THREE.Color()),
      alpha: uniform(0),
      dir: uniform(new THREE.Vector3(0, 0, -1)),
    }))
    return { bg, low, blobs }
  }, [])

  const material = useMemo(() => {
    const dir = normalize(positionLocal)
    // Background, darkening toward the horizon's underside like the 2D bg → bg2 wash.
    let color = mix(u.low, u.bg, smoothstep(-0.35, 0.25, dir.y))
    for (const b of u.blobs) color = mix(color, b.color, smoothstep(0.42, 1, dot(dir, b.dir)).mul(b.alpha))
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
    m.colorNode = vec3(color)
    return m
  }, [u])
  useEffect(() => () => material.dispose(), [material])

  // Targets from the look; uniforms ease toward them (the 2D CSS vars fade over 1.2 s).
  const targets = useRef<{ bg: THREE.Color; low: THREE.Color; blobs: Array<{ color: THREE.Color; alpha: number }> } | null>(null)
  useEffect(() => {
    targets.current = {
      bg: parseCss(look.bg).color.clone(),
      low: parseCss(look.bg2).color.clone(),
      blobs: look.sky.map((css) => {
        const { color, alpha } = parseCss(css)
        return { color: color.clone(), alpha: Math.min(1, alpha * (look.day ? 1.1 : 1.25)) }
      }),
    }
  }, [look])

  const first = useRef(true)
  useFrame(({ clock }, dt) => {
    const t = targets.current
    if (!t) return
    const k = first.current ? 1 : 1 - Math.exp(-dt * 2.2)
    first.current = false
    u.bg.value.lerp(t.bg, k)
    u.low.value.lerp(t.low, k)
    u.blobs.forEach((b, i) => {
      b.color.value.lerp(t.blobs[i].color, k)
      b.alpha.value = damp(b.alpha.value, t.blobs[i].alpha, 2.2, dt)
      const d = DRIFT[i]
      const phase = (clock.elapsedTime / d.period) * Math.PI * 2
      const az = d.az + Math.sin(phase) * d.sway
      const el = d.el + Math.cos(phase * 0.7) * d.sway * 0.5
      b.dir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    })
  })

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[40, 48, 24]} />
    </mesh>
  )
}
