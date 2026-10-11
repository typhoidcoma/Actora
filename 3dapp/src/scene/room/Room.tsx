import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import type { RoomMaterials } from './materials'

type V3 = [number, number, number]

/**
 * The room she lives in, after the reference: a warm concrete atrium. She stands
 * at the origin facing +z (the camera looks down -z). Left: a full-height window
 * wall whose mullions throw the sun across the floor. Behind her: three wide
 * steps up to a raised floor and the back wall, a recessed block above it with a
 * cove of light. Upper right: a mezzanine with a dark railing, wood doors under it.
 */
export const ROOM = {
  left: -5.2,
  right: 6.2,
  back: -5.2,
  front: 7,
  height: 7.2,
  platform: { z: -1.95, height: 0.45, x0: -2.2, x1: 6.2 },
  column: { x: -3.15, z: -2.6, r: 0.58 },
  mezz: { y: 3.5, x0: 2.3, z0: -1.55 },
}

function Box({ at, size, m, cast = false, receive = true }: { at: V3; size: V3; m: THREE.Material; cast?: boolean; receive?: boolean }) {
  return (
    <mesh position={at} castShadow={cast} receiveShadow={receive} material={m}>
      <boxGeometry args={size} />
    </mesh>
  )
}

export function Room({ mat }: { mat: RoomMaterials }) {
  const { left, right, back, front, height, platform, column, mezz } = ROOM
  const w = right - left
  const cx = (left + right) / 2
  const depth = front - back
  const cz = (front + back) / 2

  // Window wall: a grid of thin dark mullions, open to the sky.
  const mullions = useMemo(() => {
    const out: Array<{ at: V3; size: V3 }> = []
    for (let z = back + 0.6; z <= front; z += 1.15) out.push({ at: [left, height / 2, z], size: [0.1, height, 0.07] })
    for (const y of [0.04, 2.9, height - 0.05]) out.push({ at: [left, y, cz], size: [0.12, 0.08, depth] })
    return out
  }, [back, front, left, height, cz, depth])

  // Mezzanine railing: vertical bars along its front and side edges.
  const bars = useMemo(() => {
    const out: V3[] = []
    for (let x = mezz.x0 + 0.08; x < right - 0.1; x += 0.13) out.push([x, mezz.y + 0.55, mezz.z0 + 0.06])
    for (let z = back + 0.2; z < mezz.z0; z += 0.13) out.push([mezz.x0 + 0.06, mezz.y + 0.55, z])
    return out
  }, [mezz.x0, mezz.y, mezz.z0, right, back])
  const barGeo = useMemo(() => new THREE.BoxGeometry(0.025, 1.1, 0.025), [])
  useEffect(() => () => barGeo.dispose(), [barGeo])

  const stepW = platform.x1 - platform.x0
  const stepX = (platform.x0 + platform.x1) / 2

  return (
    <group>
      {/* Floor and ceiling */}
      <Box at={[cx, -0.05, cz]} size={[w, 0.1, depth]} m={mat.floor} />
      <Box at={[cx, height + 0.05, cz]} size={[w, 0.1, depth]} m={mat.wall} receive={false} />

      {/* Back wall, its recessed upper block, and the right wall with a light slot */}
      <Box at={[cx, height / 2, back - 0.1]} size={[w, height, 0.2]} m={mat.wall} />
      <Box at={[0.2, 4.9, back + 0.45]} size={[4.6, 2.9, 0.9]} m={mat.wall} cast />
      <Box at={[right + 0.1, height / 2, cz]} size={[0.2, height, depth]} m={mat.wall} />
      {/* Panel joints on the back wall: shallow fins that catch the wash. */}
      {[-1.4, 0.6, 2.6].map((x) => (
        <Box key={x} at={[x, 1.9, back + 0.02]} size={[0.03, 2.9, 0.04]} m={mat.wall} />
      ))}

      {/* The raised floor and three wide steps up to it */}
      <Box at={[stepX, platform.height / 2, (platform.z + back) / 2]} size={[stepW, platform.height, platform.z - back]} m={mat.step} />
      {[0, 1, 2].map((i) => {
        const h = platform.height * ((i + 1) / 3)
        const z0 = platform.z + (2 - i) * 0.32
        return (
          <Box key={i} at={[stepX, h / 2, z0 + 0.16]} size={[stepW - (2 - i) * 0.04, h, 0.32]} m={mat.step} />
        )
      })}

      {/* The column, floor to ceiling */}
      <mesh position={[column.x, height / 2, column.z]} castShadow receiveShadow material={mat.column}>
        <cylinderGeometry args={[column.r, column.r, height, 48]} />
      </mesh>

      {/* Window wall */}
      {mullions.map((b, i) => (
        <Box key={i} at={b.at} size={b.size} m={mat.metal} cast />
      ))}

      {/* Mezzanine: slab, its lit underside edge, the railing, wood doors below */}
      <Box at={[(mezz.x0 + right) / 2, mezz.y, (mezz.z0 + back) / 2]} size={[right - mezz.x0, 0.35, mezz.z0 - back]} m={mat.wall} cast />
      <mesh position={[(mezz.x0 + right) / 2, mezz.y - 0.2, mezz.z0 - 0.08]} material={mat.cove.material}>
        <boxGeometry args={[right - mezz.x0 - 0.2, 0.02, 0.04]} />
      </mesh>
      {bars.map((p, i) => (
        <mesh key={i} position={p} geometry={barGeo} material={mat.metal} castShadow />
      ))}
      <Box at={[(mezz.x0 + right) / 2, mezz.y + 1.12, mezz.z0 + 0.06]} size={[right - mezz.x0, 0.04, 0.05]} m={mat.metal} cast />
      <Box at={[3.6, platform.height + 1.4, back + 0.06]} size={[1.3, 2.8, 0.06]} m={mat.wood} />
      <Box at={[5.3, platform.height + 1.4, back + 0.06]} size={[1.1, 2.8, 0.06]} m={mat.wood} />
      <Box at={[right - 0.06, 1.6, -0.6]} size={[0.06, 3.2, 1.2]} m={mat.wood} />

      {/* Cove: a slot of light along the top of the back wall */}
      <mesh position={[cx, height - 0.12, back + 0.05]} material={mat.cove.material}>
        <boxGeometry args={[w - 0.4, 0.05, 0.05]} />
      </mesh>
    </group>
  )
}
