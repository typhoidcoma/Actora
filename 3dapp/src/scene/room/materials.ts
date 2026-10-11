import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'

/** The room is one plain 70% white for now (no textures); the light does the work. */
export const ROOM_WHITE = '#b3b3b3'

const plain = (roughness: number) => new THREE.MeshStandardMaterial({ color: ROOM_WHITE, roughness, metalness: 0 })

export interface RoomMaterials {
  wall: THREE.MeshStandardMaterial
  floor: THREE.MeshStandardMaterial
  column: THREE.MeshStandardMaterial
  step: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
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
  return {
    wall: plain(0.9),
    // Same white, polished: it still reflects the windows and the cove.
    floor: plain(0.28),
    column: plain(0.85),
    step: plain(0.7),
    // Doors are wall-white too for now.
    wood: plain(0.6),
    // The window mullions and the railing stay dark so the window wall still reads.
    metal: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.45, metalness: 0.6 }),
    cove: strip(),
    accent: strip(),
  }
}
