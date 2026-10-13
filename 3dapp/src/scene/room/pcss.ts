import * as THREE from 'three/webgpu'
import {
  Fn,
  If,
  Loop,
  float,
  int,
  interleavedGradientNoise,
  ivec2,
  max,
  min,
  screenCoordinate,
  texture,
  textureLoad,
  uniform,
  vec3,
  vogelDiskSample,
} from 'three/tsl'

/**
 * Contact-hardening soft shadows (PCSS) for the sun: crisp where a shadow
 * touches what casts it (her feet, a column's base), softening with distance,
 * as the mullions' shadows do across a real floor. three's own PCF blurs every
 * edge by the same few texels.
 *
 * For an orthographic (directional) shadow camera, shadow depth is linear, so
 * receiver minus blocker depth is a distance in metres, and the penumbra is
 * that distance times the sun's apparent size.
 */

const BLOCKER_SAMPLES = 16
const FILTER_SAMPLES = 24

type Frustum = { width: number; depth: number }
type FilterInputs = { depthTexture: THREE.DepthTexture; shadowCoord: ReturnType<typeof vec3>; shadow: THREE.LightShadow }

/**
 * @param frustum the shadow camera: its width (left to right) and depth (far
 *   minus near), both in metres.
 * @param softness tan of the sun's apparent radius: 0.005 is the real sun, more
 *   reads as light through a window from a bright sky.
 * @param maxReach the furthest an occluder can sit above what it shades and
 *   still widen the penumbra, in metres (sets the blocker search area).
 */
export function pcssFilter(frustum: Frustum, softness = 0.008, maxReach = 6) {
  const lightSize = uniform(softness)
  const depthToWidth = frustum.depth / frustum.width

  const filter = Fn(({ depthTexture, shadowCoord, shadow }: FilterInputs) => {
    const uv = shadowCoord.xy
    const zR = shadowCoord.z
    const size = shadow.mapSize.width
    const texel = float(1 / size)
    const phi = interleavedGradientNoise(screenCoordinate.xy).mul(6.28318530718)
    // Where to look for blockers, and the widest the penumbra gets (in shadow-map uv).
    const searchRadius = lightSize.mul(maxReach / frustum.width).max(texel.mul(2))

    // 1. Blockers: the average depth of whatever sits between here and the sun.
    const blockerSum = float(0).toVar()
    const blockers = float(0).toVar()
    Loop({ start: int(0), end: int(BLOCKER_SAMPLES) }, ({ i }) => {
      const at = uv.add(vogelDiskSample(i, int(BLOCKER_SAMPLES), phi).mul(searchRadius))
      const raw = textureLoad(depthTexture, ivec2(at.clamp(0, 1).mul(size - 1)))
      // This read and the compares below share one binding; it has to declare the
      // comparison sampler the compares need (a load itself ignores the sampler).
      ;(raw as unknown as { _samplerComparison: boolean })._samplerComparison = true
      const d = raw.x
      If(d.lessThan(zR), () => {
        blockerSum.addAssign(d)
        blockers.addAssign(1)
      })
    })

    const lit = float(1).toVar()
    If(blockers.greaterThan(0), () => {
      // 2. Penumbra: wider the further the blocker is from this point.
      const zB = blockerSum.div(blockers)
      const penumbra = min(zR.sub(zB).mul(depthToWidth).mul(lightSize), searchRadius)
      const radius = max(penumbra, texel.mul(1.5))

      // 3. Filter over that width (each tap is itself a hardware 2x2 comparison).
      const sum = float(0).toVar()
      Loop({ start: int(0), end: int(FILTER_SAMPLES) }, ({ i }) => {
        const at = uv.add(vogelDiskSample(i, int(FILTER_SAMPLES), phi.add(1.7)).mul(radius))
        sum.addAssign(texture(depthTexture, at).compare(zR))
      })
      lit.assign(sum.div(FILTER_SAMPLES))
    })
    return lit
  })

  return { filter, lightSize }
}
