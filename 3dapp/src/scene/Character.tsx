import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { orbSignals, useAgent } from '@actora/stores/agent'
import { panelOpen, useUi } from '@actora/stores/ui'
import { AgentAnimator } from '../bridge/agentAnim'
import { Wander } from '../bridge/wander'
import { gestureFor } from '../bridge/poses'
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
      .then(async (gltf) => {
        gltf.animations.push(...(await extraClips()))
        if (live) setLoaded({ gltf })
      })
      .catch(() => live && setLoaded({ missing: true }))
    return () => {
      live = false
    }
  }, [])
  return loaded
}

/**
 * Extra animation clips (character.clips): GLB or FBX files, e.g. from Mixamo,
 * each named after its file ("texting.fbx" → "texting"). Mixamo's skeleton
 * binds by bone name; position tracks are dropped so a clip plays in place
 * (and FBX centimetres can't fling her across the room). A file that fails is skipped.
 */
async function extraClips(): Promise<THREE.AnimationClip[]> {
  const out: THREE.AnimationClip[] = []
  for (const url of character.clips) {
    try {
      const name = url.split('/').pop()!.replace(/.[^.]+$/, '').toLowerCase()
      const clips = /.fbx$/i.test(url)
        ? (await new (await import('three/addons/loaders/FBXLoader.js')).FBXLoader().loadAsync(url)).animations
        : (await new GLTFLoader().loadAsync(url)).animations
      const clip = clips[0]
      if (!clip) continue
      clip.name = name
      clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.position'))
      out.push(clip)
    } catch {
      /* missing or unreadable: she does without it */
    }
  }
  return out
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
  const plain = character.tint ? new THREE.MeshStandardMaterial({ color: character.tint, roughness: 0.6, metalness: 0 }) : null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    if (plain) mesh.material = plain
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
    let lastEmoji = lastReact(useAgent.getState().messages)
    const off = useAgent.subscribe((s) => {
      anim.setPhase(s.phase)
      if (s.reaction && s.reaction !== lastReaction) anim.react(s.reaction.bus, s.reaction.intensity, s.reaction.holdMs)
      lastReaction = s.reaction
      // Her emoji on your message (her "got it"): she acts it out, then carries on.
      const emoji = lastReact(s.messages)
      if (emoji.key !== lastEmoji.key && emoji.react) anim.emote(gestureFor(emoji.react))
      lastEmoji = emoji
    })
    return () => {
      off()
      anim.dispose()
      animator.current = null
    }
  }, [gltf])

  const here = useMemo(() => new THREE.Vector3(), [])
  const mover = useRef<THREE.Group>(null)
  const wander = useMemo(() => new Wander(), [])
  const lastHeading = useRef<number | null>(null)
  const thinkFor = useRef(0)
  useFrame(({ camera, size }, dt) => {
    const m = mover.current
    const anim = animator.current
    if (!m || !anim) return
    // Each streamed token bumps orbSignals; the 2D orb decays it, so here we do.
    orbSignals.energy *= Math.exp(-dt * 3.2)

    // Busy at home (working on a turn, nothing streamed yet): she gets up and
    // does something (wander.ts) instead of standing frozen; back to her spot after.
    const ui = useUi.getState()
    const open = ui.chatOpen || panelOpen(ui)
    const a = useAgent.getState()
    // Working on a turn at home (nothing streamed yet). With tools running (a search,
    // a lookup) she gets up and wanders; just thinking, she stands in a thinking pose.
    // Phones frame her head and shoulders: wandering would only walk her out of shot.
    const wide = size.width / size.height >= 0.8
    const working = !open && (a.awaitingTurn || a.turnId !== null) && !a.streaming
    const usingTools = a.steps.length > 0
    const busy = wide && working && usingTools
    thinkFor.current = working && !usingTools ? thinkFor.current + dt : 0
    const facing = lastHeading.current === null ? 1 : Math.cos(lastHeading.current - m.rotation.y)
    const w = wander.update(dt, busy || devBusy(), m.position, anim.walkSpeed, facing)
    lastHeading.current = w.walking ? w.heading : null
    // Her offset from her spot, for the camera to follow (gently) while she wanders.
    herOffset.set(m.position.x, 0, m.position.z)
    const home = Math.hypot(m.position.x, m.position.z) < 0.05
    anim.setActivity(w.walking ? 'walk' : w.phone ? 'phone' : thinkFor.current > 1.2 && home ? 'think' : null)
    anim.phoneGlow = document.documentElement.dataset.theme === 'dusk' ? 0.09 : 0.05
    anim.update(dt, orbSignals.energy)

    // Facing: along her path while walking; otherwise toward you (or, with a panel
    // open, a little toward it, presenting it). Looking around turns her off that.
    m.getWorldPosition(here)
    const toYou = Math.atan2(camera.position.x - here.x, camera.position.z - here.z)
    const face = w.walking ? (w.heading ?? toYou) : open ? 0.42 : toYou + (w.heading ?? 0)
    m.rotation.y = dampAngle(m.rotation.y, face, w.walking ? 7 : 3, dt)
  })

  return (
    <group ref={mover}>
      <primitive object={gltf.scene} />
    </group>
  )
}

/** The emoji on the latest message she reacted to, keyed so the same emoji on a new message counts. */
function lastReact(messages: Array<{ id: string; react?: string }>): { key: string; react?: string } {
  const m = messages.findLast((x) => x.react)
  return { key: m ? `${m.id}:${m.react}` : '', react: m?.react }
}

/** How far she has wandered from her spot (read by the camera rig). */
export const herOffset = new THREE.Vector3()

/** Eases an angle along the short way round. */
function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + d * (1 - Math.exp(-lambda * Math.min(dt, 0.1)))
}

/** Dev: `__actora3d.busy = true` sends her wandering without a turn in flight. */
const devBusy = () => import.meta.env.DEV && !!(window as unknown as { __actora3d?: { busy?: boolean } }).__actora3d?.busy

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
