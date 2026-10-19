import * as THREE from 'three/webgpu'
import {
  Fn,
  If,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  pow,
  screenCoordinate,
  screenUV,
  select,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

// An amorphous, matte, softly lit blob (art direction: soft toon render, no
// outlines, gentle rim, subtle grain), written in TSL. Everything is driven by
// smoothed uniforms that Orb.tsx eases each frame.

/** Each orb's uniforms. */
export function orbUniforms() {
  return {
    /** Flow time (accumulated at a phase-dependent speed). */
    time: uniform(0),
    /** Wall clock seconds, for the grain. */
    clock: uniform(0),
    /** Edge displacement. */
    amp: uniform(0.05),
    /** Interior swirl. */
    swirl: uniform(0.2),
    /** Outer glow strength. */
    glow: uniform(0.4),
    /** 0..1 offline desaturation. */
    desat: uniform(0.8),
    /** -1..1 reaction (positive flare / negative contract). */
    react: uniform(0),
    /** Cognitive wobble. */
    wobble: uniform(0),
    /** Speaking energy 0..1. */
    energy: uniform(0),
    /** -1..1 slow idle breathing. */
    breath: uniform(0),
    /** 0 dusk .. 1 daylight (the glow becomes a soft tinted shadow). */
    day: uniform(1),
    c1: uniform(new THREE.Vector3(0.2, 0.3, 0.8)),
    c2: uniform(new THREE.Vector3(0.5, 0.4, 0.7)),
    c3: uniform(new THREE.Vector3(0.8, 0.9, 0.3)),
  }
}

export type OrbUniforms = ReturnType<typeof orbUniforms>

type V3 = THREE.Node<'vec3'>
type F = THREE.Node<'float'>

const cmax = (c: V3) => max(c.r, max(c.g, c.b))
const sat = (c: V3) => {
  const m = cmax(c)
  return select(m.greaterThan(1e-4), m.sub(min(c.r, min(c.g, c.b))).div(m), float(0))
}

// Mixing like light, not paint: a plain lerp of two hues (amber + turquoise)
// loses saturation and brightness where they meet and turns muddy. This keeps
// the in-between as saturated and as bright as the two colours it comes from.
const vivid = Fn(([x, y, t]: [V3, V3, F]) => {
  const c = mix(x, y, t).toVar()
  const m = cmax(c).toVar()
  const s = sat(c).toVar()
  If(s.greaterThan(1e-4), () => {
    c.assign(m.sub(m.sub(c).mul(min(mix(sat(x), sat(y), t).div(s), 2.5))))
  })
  return max(c, 0).mul(mix(cmax(x), cmax(y), t).div(max(m, 1e-4)))
}).setLayout({
  name: 'orbVivid',
  type: 'vec3',
  inputs: [
    { name: 'x', type: 'vec3' },
    { name: 'y', type: 'vec3' },
    { name: 't', type: 'float' },
  ],
})

const hash = Fn(([p0]: [V3]) => {
  const p = fract(p0.mul(0.3183099).add(0.1)).mul(17).toVar()
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)))
}).setLayout({ name: 'orbHash', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] })

const noise = Fn(([x]: [V3]) => {
  const i = floor(x).toVar()
  const g = fract(x).toVar()
  const f = g
    .mul(g)
    .mul(float(3).sub(g.mul(2)))
    .toVar()
  const h = (dx: number, dy: number, dz: number) => hash(i.add(vec3(dx, dy, dz)))
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  )
}).setLayout({ name: 'orbNoise', type: 'float', inputs: [{ name: 'x', type: 'vec3' }] })

const fbm = Fn(([p0]: [V3]) => {
  const s = float(0).toVar()
  let p: V3 = p0
  let a = 0.5
  for (let i = 0; i < 4; i++) {
    s.addAssign(noise(p).mul(a))
    p = p.mul(2.03)
    a *= 0.5
  }
  return s
}).setLayout({ name: 'orbFbm', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] })

/** The orb's colour, premultiplied by its alpha, for a full-canvas quad. */
export function orbFragment(u: OrbUniforms) {
  return Fn(() => {
    // -1..1 across the canvas, y up (screenUV's origin is the top left).
    const p = vec2(screenUV.x, screenUV.y.oneMinus()).mul(2).sub(1).toVar()
    const r = length(p).toVar()
    const ang = atan(p.y, p.x).toVar()
    const dir = vec2(cos(ang), sin(ang))

    // Silhouette: noise on the unit circle, so the edge stays continuous.
    const base = float(0.6).mul(u.react.mul(0.07).add(1).add(u.breath.mul(0.03)))
    const n = fbm(vec3(dir.mul(u.wobble.mul(1.6).add(1.25)), u.time.mul(0.55)))
    const disp = n
      .sub(0.5)
      .mul(2)
      .mul(u.amp)
      .add(
        sin(ang.mul(3).add(u.time.mul(1.2)))
          .mul(u.amp)
          .mul(0.3),
      )
    const R = base.add(disp).toVar()
    const d = r.sub(R).toVar()
    const body = smoothstep(-0.01, 0.01, d).oneMinus().toVar()

    // Interior: two swirled fbm fields blend the three mood colours.
    const sw = u.swirl.mul(r.oneMinus()).mul(2.4).add(u.time.mul(0.18))
    const cs = cos(sw).toVar()
    const sn = sin(sw).toVar()
    const q = vec2(cs.mul(p.x).add(sn.mul(p.y)), cs.mul(p.y).sub(sn.mul(p.x))).toVar()
    const f1 = fbm(vec3(q.mul(1.6), u.time.mul(0.32)))
    const f2 = fbm(vec3(q.mul(3).add(4), u.time.mul(0.46)))
    const col = vivid(u.c1, u.c2, smoothstep(0.28, 0.72, f1)).toVar()
    col.assign(vivid(col, u.c3, smoothstep(0.58, 0.9, f2).mul(0.6)))

    // Soft volume: darker toward the edge, broad low-contrast key light top-left.
    const rr = clamp(r.div(R), 0, 1).toVar()
    col.mulAssign(mix(float(1.06), float(0.5), pow(rr, 2.3)))
    const key = smoothstep(0, 0.95, length(p.sub(vec2(-0.26, 0.3)))).oneMinus()
    col.addAssign(vec3(1, 0.95, 0.85).mul(key.mul(0.09)))

    // Gentle rim.
    const rim = smoothstep(0.72, 1, rr).mul(body)
    col.addAssign(mix(u.c3, vec3(1), 0.25).mul(rim).mul(u.energy.mul(0.5).add(0.22)))

    col.mulAssign(u.energy.mul(0.22).add(1).add(max(u.react, 0).mul(0.32)))
    col.mulAssign(min(u.react, 0).mul(0.25).add(1))

    const lum = dot(col, vec3(0.299, 0.587, 0.114))
    col.assign(mix(col, vec3(lum.mul(mix(float(0.65), float(0.9), u.day))), u.desat))

    // Outer glow at dusk; in daylight a light glow reads as dirt on cream, so it
    // becomes a soft, mood-tinted contact shadow beneath the blob instead.
    const glow = exp(max(d, 0).mul(-8.5)).mul(body.oneMinus()).mul(u.glow).mul(u.day.mul(0.75).oneMinus())
    const gcol = vivid(u.c1, u.c2, float(0.5)).mul(mix(float(1), float(0.35), u.desat))
    const sd = length(p.sub(vec2(0, -0.07))).sub(R)
    const shadow = exp(max(sd, 0).mul(-7)).mul(body.oneMinus()).mul(0.32).mul(u.day)
    const scol = u.c2.mul(0.45)

    // Film grain.
    const grain = hash(vec3(screenCoordinate.xy, floor(u.clock.mul(24)))).sub(0.5)
    col.addAssign(grain.mul(0.025).mul(body))

    const out = col.mul(body).add(gcol.mul(glow)).add(scol.mul(shadow))
    const alpha = clamp(body.add(glow.mul(0.85)).add(shadow), 0, 1)
    return vec4(out, alpha)
  })()
}
