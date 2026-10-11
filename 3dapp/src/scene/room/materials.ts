import * as THREE from 'three/webgpu'
import { color, float, mix, mx_noise_float, positionWorld, uniform, vec3 } from 'three/tsl'

/**
 * Board-formed concrete without textures: a warm base broken up by two scales
 * of noise (large clouding and a fine grain) in tint and roughness.
 */
function concrete(base: string, roughness: number, scale = 1): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  const p = positionWorld.mul(scale)
  const cloud = mx_noise_float(p.mul(0.35)).mul(0.5).add(0.5)
  const grain = mx_noise_float(p.mul(9)).mul(0.5).add(0.5)
  const shade = cloud.mul(0.12).add(grain.mul(0.05)).add(0.88)
  m.colorNode = color(base).mul(shade)
  m.roughnessNode = float(roughness).add(cloud.sub(0.5).mul(0.12)).add(grain.sub(0.5).mul(0.06))
  m.metalness = 0
  return m
}

export interface RoomMaterials {
  wall: THREE.MeshStandardNodeMaterial
  floor: THREE.MeshStandardNodeMaterial
  column: THREE.MeshStandardNodeMaterial
  step: THREE.MeshStandardNodeMaterial
  wood: THREE.MeshStandardNodeMaterial
  metal: THREE.MeshStandardMaterial
  /** Light strips: colour × strength, brighter than white so the bloom carries them. */
  cove: Strip
  accent: Strip
}

export interface Strip {
  material: THREE.MeshBasicNodeMaterial
  color: { value: THREE.Color }
  strength: { value: number }
}

function strip(): Strip {
  const c = uniform(new THREE.Color('#ffd9a8'))
  const s = uniform(2.2)
  const material = new THREE.MeshBasicNodeMaterial({ fog: false, toneMapped: true })
  material.colorNode = c.mul(s)
  return { material, color: c, strength: s }
}

export function roomMaterials(): RoomMaterials {
  const floor = concrete('#cbb9a2', 0.24, 0.7)
  // A polished pour: a faint darker mottle, kept glossy.
  floor.colorNode = mix(color('#b8a690'), color('#d3c2ab'), mx_noise_float(positionWorld.mul(0.22)).mul(0.5).add(0.5))
  return {
    wall: concrete('#d8c8b2', 0.86),
    floor,
    column: concrete('#d2c3ae', 0.8, 1.3),
    step: concrete('#d0bfa8', 0.62),
    wood: (() => {
      const m = new THREE.MeshStandardNodeMaterial()
      const p = positionWorld
      // Vertical grain: stretched noise along y.
      const grain = mx_noise_float(vec3(p.x.mul(18), p.y.mul(0.6), p.z.mul(18))).mul(0.5).add(0.5)
      m.colorNode = mix(color('#4a2a18'), color('#7a4a2c'), grain)
      m.roughness = 0.55
      return m
    })(),
    metal: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.45, metalness: 0.6 }),
    cove: strip(),
    accent: strip(),
  }
}
