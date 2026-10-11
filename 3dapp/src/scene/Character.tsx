import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three/webgpu'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { orbSignals, useAgent } from '@actora/stores/agent'
import { AgentAnimator } from '../bridge/agentAnim'
import { character } from '../character'

type Loaded = { gltf: GLTF } | { missing: true } | null

/** The real character if it's been converted, else the dev placeholder, else a stand-in. */
function useCharacterModel(): Loaded {
  const [loaded, setLoaded] = useState<Loaded>(null)
  useEffect(() => {
    let live = true
    const loader = new GLTFLoader()
    loader
      .loadAsync(character.url)
      .catch(() => loader.loadAsync(character.placeholderUrl))
      .then((gltf) => live && setLoaded({ gltf }))
      .catch(() => live && setLoaded({ missing: true }))
    return () => {
      live = false
    }
  }, [])
  return loaded
}

/** Scales to character.height and stands the model on the floor at the origin. */
function fit(root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  if (size.y <= 0) return
  root.scale.setScalar(character.height / size.y)
  box.setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.set(-center.x, -box.min.y, -center.z)
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
}

export function Character() {
  const model = useCharacterModel()
  if (!model) return null
  if ('missing' in model) return <StandIn />
  return <Animated gltf={model.gltf} />
}

function Animated({ gltf }: { gltf: GLTF }) {
  const [animator] = useState(() => {
    fit(gltf.scene)
    return new AgentAnimator(gltf.scene, gltf.animations)
  })

  useEffect(() => {
    animator.setPhase(useAgent.getState().phase)
    let lastReaction = useAgent.getState().reaction
    const off = useAgent.subscribe((s) => {
      animator.setPhase(s.phase)
      if (s.reaction && s.reaction !== lastReaction) animator.react(s.reaction.bus, s.reaction.intensity, s.reaction.holdMs)
      lastReaction = s.reaction
    })
    return off
  }, [animator])
  useEffect(() => () => animator.dispose(), [animator])

  useFrame((_, dt) => {
    // Each streamed token bumps orbSignals; the 2D orb decays it, so here we do.
    orbSignals.energy *= Math.exp(-dt * 3.2)
    animator.update(dt, orbSignals.energy)
  })

  return <primitive object={gltf.scene} />
}

/** No model on disk yet: a capsule that still breathes with her phase. */
function StandIn() {
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null)
  useFrame(({ clock }, dt) => {
    if (!mesh) return
    const { phase } = useAgent.getState()
    orbSignals.energy *= Math.exp(-dt * 3.2)
    const speed = phase === 'thinking' || phase === 'tool' ? 4 : 1.5
    mesh.position.y = 0.85 + Math.sin(clock.elapsedTime * speed) * 0.03 + orbSignals.energy * 0.05
  })
  return (
    <mesh ref={setMesh} castShadow>
      <capsuleGeometry args={[0.3, 1.1, 8, 24]} />
      <meshStandardMaterial color="#8f86ff" roughness={0.4} />
    </mesh>
  )
}
