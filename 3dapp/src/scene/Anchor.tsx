import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'

const els = new Map<string, HTMLElement>()

/** Ref for a DOM element that should ride a point in the scene (see Anchor). */
export const anchorRef = (name: string) => (el: HTMLElement | null) => {
  if (el) els.set(name, el)
  else els.delete(name)
}

/**
 * A point in the scene that a DOM element follows: each frame it's projected to
 * the screen and the element is moved there (its left edge, vertically centred).
 * For the few 2D controls that stay DOM (the menu and its popover).
 */
export function Anchor({ name, position }: { name: string; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const el = els.get(name)
    if (!el || !ref.current) return
    ref.current.getWorldPosition(v).project(camera)
    const x = ((v.x + 1) / 2) * size.width
    const y = ((1 - v.y) / 2) * size.height
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`
  })
  return <group ref={ref} position={position} />
}
