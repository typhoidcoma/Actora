import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { orbSignals, useAgent } from '@actora/stores/agent'
import { panelOpen, useUi } from '@actora/stores/ui'
import { damp } from '../look/motion'
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
  // Measure from scratch so fitting twice gives the same result.
  root.scale.setScalar(1)
  root.position.set(0, 0, 0)
  root.updateMatrixWorld(true)
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
  const animator = useRef<AgentAnimator | null>(null)

  // Built and torn down in one effect: StrictMode's mount-unmount-mount must
  // never leave a disposed mixer behind (that froze her in a T-pose).
  useEffect(() => {
    fit(gltf.scene)
    const anim = new AgentAnimator(gltf.scene, gltf.animations)
    animator.current = anim
    anim.setPhase(useAgent.getState().phase)
    let lastReaction = useAgent.getState().reaction
    const off = useAgent.subscribe((s) => {
      anim.setPhase(s.phase)
      if (s.reaction && s.reaction !== lastReaction) anim.react(s.reaction.bus, s.reaction.intensity, s.reaction.holdMs)
      lastReaction = s.reaction
    })
    return () => {
      off()
      anim.dispose()
      animator.current = null
    }
  }, [gltf])

  useFrame((_, dt) => {
    // Each streamed token bumps orbSignals; the 2D orb decays it, so here we do.
    orbSignals.energy *= Math.exp(-dt * 3.2)
    animator.current?.update(dt, orbSignals.energy)
    // With a panel open she turns a little toward it, presenting it.
    const ui = useUi.getState()
    const open = ui.chatOpen || panelOpen(ui)
    gltf.scene.rotation.y = damp(gltf.scene.rotation.y, open ? 0.42 : 0, 3, dt)
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
