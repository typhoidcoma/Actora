import * as THREE from 'three/webgpu'
import { float, reflector, uniform } from 'three/tsl'

/** The room is one plain 80% white for now (no textures); the light does the work. */
const ROOM_WHITE = '#cccccc'

const plain = (roughness: number) => new THREE.MeshStandardMaterial({ color: ROOM_WHITE, roughness, metalness: 0 })

export interface RoomMaterials {
  wall: THREE.MeshStandardMaterial
  floor: THREE.MeshStandardNodeMaterial
  /** The floor's mirror: its target goes in the scene at floor level; strength is eased by the lighting. */
  floorReflection: { target: THREE.Object3D; strength: { value: number } }
  column: THREE.MeshStandardMaterial
  step: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  /** The cove light strip: colour × strength, brighter than white so the bloom carries it. */
  cove: Strip
}

interface Strip {
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

/**
 * Polished floor: the same white, with a live mirror of the room (her, the steps,
 * the windows) softened from a half-size, mipmapped capture so it reads as
 * polished concrete, not glass. Once a frame (no bounces), the UI layer left out.
 */
function polishedFloor(): Pick<RoomMaterials, 'floor' | 'floorReflection'> {
  const mirror = reflector({ resolutionScale: 0.5, generateMipmaps: true, bounces: false })
  mirror.target.rotation.x = -Math.PI / 2
  const strength = uniform(0.2)
  const floor = new THREE.MeshStandardNodeMaterial({ color: ROOM_WHITE, roughness: 0.28, metalness: 0 })
  floor.emissiveNode = mirror.level(float(1.6)).rgb.mul(strength)
  return { floor, floorReflection: { target: mirror.target, strength } }
}

export function roomMaterials(): RoomMaterials {
  return {
    wall: plain(0.9),
    ...polishedFloor(),
    column: plain(0.85),
    step: plain(0.7),
    // Doors are wall-white too for now.
    wood: plain(0.6),
    // The window mullions and the railing stay dark so the window wall still reads.
    metal: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.45, metalness: 0.6 }),
    cove: strip(),
  }
}
