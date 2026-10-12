import * as THREE from 'three/webgpu'
import type { ReactionBus } from '@actora/aelora/protocol'
import { character, type Phase } from '../character'
import { GESTURES, HOLDS, POSED_BONES, PoseLayer, type Pose } from './poses'

const FADE = 0.4

function pick(clips: THREE.AnimationClip[], names: readonly string[]): THREE.AnimationClip | undefined {
  for (const name of names) {
    const hit = clips.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (hit) return hit
  }
  return undefined
}

/**
 * Drives the character from the agent's state: a looping base clip per phase,
 * crossfaded; avatar.react as additive one-shots on top; and while she speaks,
 * a nod on the head bone that follows the token stream's energy.
 */
export class AgentAnimator {
  private mixer: THREE.AnimationMixer
  private base = new Map<Phase, THREE.AnimationAction>()
  private emotes = new Map<ReactionBus, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private head: THREE.Object3D | null = null
  private nod = 0
  private t = 0
  private speaking = false
  private phase: Phase = 'idle'
  /** A clip that overrides the phase loop while she's doing something (walking, a phone clip). */
  private activity: THREE.AnimationAction | null = null
  private activityName: string | null = null
  private clips: THREE.AnimationClip[]
  /** Metres per second the walk clip's feet travel over the floor (so she doesn't slide). */
  walkSpeed = 0.75
  /** Held poses while she's busy (phone, thinking) and one-shot gestures (her emoji), over the clips. */
  private hold: PoseLayer
  private gesture: PoseLayer
  private gestureLeft = 0
  /** A downloaded gesture clip playing instead of a procedural gesture. */
  private gestureClip: THREE.AnimationAction | null = null
  private phoneMesh: THREE.Object3D | null = null
  private handScale = 1
  private phoneLight: THREE.PointLight | null = null
  /** How bright the screen's glow is: a touch more at dusk, when the room is darker (set by the scene). */
  phoneGlow = 0.06
  /** The model has its own phone clip: use it instead of the procedural pose. */
  private phoneClip: THREE.AnimationClip | undefined

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root)
    this.clips = clips
    root.traverse((o) => {
      if (!this.head && character.headBone.test(o.name)) this.head = o
    })
    this.phoneClip = pick(clips, character.busy.phone)
    const bones = new Map<string, THREE.Object3D>()
    root.traverse((o) => {
      // Names arrive as 'mixamorigRightArm' (the loader drops the colon): match the ending, longest first.
      const short = POSED_BONES.filter((b) => o.name.endsWith(b)).sort((p, q) => q.length - p.length)[0]
      if (short && !bones.has(short)) bones.set(short, o)
    })
    this.hold = new PoseLayer(bones, 4)
    this.gesture = new PoseLayer(bones, 7)
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.gestureClip) {
        this.gestureClip.fadeOut(0.35)
        this.gestureClip = null
      }
    })
    if (!this.phoneClip) this.buildPhone(root)
    this.walkSpeed = this.measureWalk(root)

    const used = new Set<THREE.AnimationClip>()
    for (const phase of Object.keys(character.base) as Phase[]) {
      const clip = pick(clips, character.base[phase]) ?? clips[0]
      if (!clip) continue
      used.add(clip)
      // Phases sharing a clip share an action, so switching between them doesn't restart it.
      this.base.set(phase, this.mixer.clipAction(clip))
    }
    for (const bus of Object.keys(character.emotes) as ReactionBus[]) {
      const clip = pick(clips, character.emotes[bus])
      if (!clip || used.has(clip)) continue
      const action = this.mixer.clipAction(THREE.AnimationUtils.makeClipAdditive(clip.clone()))
      action.blendMode = THREE.AdditiveAnimationBlendMode
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      this.emotes.set(bus, action)
    }
  }

  setPhase(phase: Phase): void {
    this.speaking = phase === 'speaking'
    this.phase = phase
    if (this.activity) return
    this.fadeTo(this.base.get(phase))
  }

  /**
   * What she's doing beyond her phase: 'walk', 'phone', 'think', or null (back to
   * the phase loop). Without a clip for it, phone and think are procedural poses.
   */
  setActivity(kind: 'walk' | 'phone' | 'think' | null): void {
    const names =
      kind === 'walk' ? character.busy.walk : kind === 'phone' ? character.busy.phone : kind === 'think' ? character.busy.think : null
    const clipFor = names ? pick(this.clips, names) : undefined
    if (!devHold()) this.hold.set(kind === 'phone' && !clipFor ? HOLDS.phone : kind === 'think' && !clipFor ? HOLDS.think : null)
    const clip = names ? pick(this.clips, names) : undefined
    const name = clip?.name ?? null
    if (name === this.activityName) return
    this.activityName = name
    this.activity = clip ? this.mixer.clipAction(clip) : null
    this.fadeTo(this.activity ?? this.base.get(this.phase))
  }

  private fadeTo(next: THREE.AnimationAction | undefined): void {
    if (!next || next === this.current) return
    next.reset().setEffectiveWeight(1).play()
    if (this.current) this.current.crossFadeTo(next, FADE, false)
    else next.fadeIn(FADE)
    this.current = next
  }

  /**
   * Her emoji, acted out: a downloaded clip named after the gesture if she has one
   * (e.g. "thumbsup.fbx"), played once over whatever she's doing; otherwise the
   * procedural gesture, eased in, held, and eased back out.
   */
  emote(name: string): void {
    const clip = pick(this.clips, [name, name.replace(/([A-Z])/g, '_$1')])
    if (clip) {
      const a = this.mixer.clipAction(clip)
      a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).fadeIn(0.3).play()
      a.clampWhenFinished = false
      this.gestureClip = a
      return
    }
    const pose: Pose | undefined = GESTURES[name]
    if (!pose) return
    this.gesture.set(pose)
    this.gestureLeft = 0.35 + (pose.hold ?? 1.2)
  }

  react(bus: ReactionBus, intensity: number, holdMs: number): void {
    const action = this.emotes.get(bus)
    if (!action) return
    action.reset().setEffectiveWeight(Math.max(0.2, Math.min(1, intensity))).fadeIn(0.2).play()
    // Hold it, then ease back to the base pose.
    window.setTimeout(() => action.fadeOut(0.5), Math.max(400, holdMs))
  }

  update(dt: number, energy: number): void {
    this.t += dt
    // Undo last frame's nod and pose before the mixer writes this one (a clip may not animate those bones).
    if (this.head) this.head.rotation.x -= this.nod
    this.gesture.undo()
    this.hold.undo()
    this.mixer.update(dt)

    // Dev: __actora3d = { hold: 'think' | 'phone', gesture: 'wave', poses: { wave: {...} } }.
    const dev = devHooks()
    if (dev?.poses) Object.assign(GESTURES, dev.poses)
    if (dev?.hold !== undefined) this.hold.set(dev.hold ? (dev.poses?.[dev.hold] ?? HOLDS[dev.hold] ?? null) : null)
    if (this.phoneMesh && dev?.at) this.phoneMesh.position.set(...dev.at).divideScalar(this.handScale)
    if (this.phoneMesh && dev?.turn) this.phoneMesh.rotation.set(...dev.turn)
    if (dev?.gesture) {
      this.emote(dev.gesture)
      dev.gesture = undefined
    }

    // A gesture runs its course, then eases out; the held pose steps aside meanwhile.
    if (this.gestureLeft > 0) {
      this.gestureLeft -= dt
      if (this.gestureLeft <= 0) this.gesture.set(null)
    }
    this.hold.apply(dt, this.t, 1 - this.gesture.w)
    this.gesture.apply(dt, this.t)
    const w = this.hold.current?.tablet ? this.hold.w * (1 - this.gesture.w) : 0

    // Shown and hidden by scale, never by .visible: hiding it would take its light out of
    // the scene, and a change in the scene's lights recompiles every lit shader (a
    // third of a second's freeze each time she took her phone out or put it away).
    if (this.phoneMesh) this.phoneMesh.scale.setScalar(w > 0.35 ? 1 : 0.0001)
    // The screen's glow on her face: fades in with the phone, flickers a touch as she scrolls.
    if (this.phoneLight) this.phoneLight.intensity = w * this.phoneGlow * (1 + Math.sin(this.t * 2.3) * 0.08 + Math.sin(this.t * 7.1) * 0.04)

    this.nod = this.speaking ? energy * 0.12 * Math.sin(this.t * 9) : 0
    if (this.head) this.head.rotation.x += this.nod
  }

  /**
   * The walk clip plays in place: a planted foot sweeps backward under her at
   * the speed she'd move over the floor. Sampled once: the fastest backward
   * sweep of a foot, relative to her hips, along her facing (+z), in world metres.
   */
  private measureWalk(root: THREE.Object3D): number {
    const clip = pick(this.clips, character.busy.walk)
    let foot: THREE.Object3D | null = null
    let hips: THREE.Object3D | null = null
    root.traverse((o) => {
      if (!foot && /LeftFoot$/.test(o.name)) foot = o
      if (!hips && /Hips$/.test(o.name)) hips = o
    })
    if (!clip || !foot || !hips) return 0.75
    const f = foot as THREE.Object3D
    const h = hips as THREE.Object3D
    const probe = new THREE.AnimationMixer(root)
    const action = probe.clipAction(clip).play()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const steps = 48
    const dt = clip.duration / steps
    const z: number[] = []
    for (let i = 0; i <= steps; i++) {
      action.time = i * dt
      probe.update(0)
      root.updateMatrixWorld(true)
      f.getWorldPosition(a)
      h.getWorldPosition(b)
      z.push(a.z - b.z)
    }
    action.stop()
    probe.uncacheRoot(root)
    // Ground speed while planted: the median of the backward sweeps (forward swings excluded).
    const back = z.slice(1).map((v, i) => (z[i] - v) / dt).filter((v) => v > 0).sort((p, q) => p - q)
    const speed = back.length ? back[Math.floor(back.length * 0.6)] : 0.75
    return Math.min(1.6, Math.max(0.35, speed))
  }

  /** A phone in her right hand for the procedural phone pose (bridge/poses.ts), with its screen's light. */
  private buildPhone(root: THREE.Object3D): void {
    let found: THREE.Object3D | null = null
    root.traverse((o) => {
      if (!found && /RightHand$/.test(o.name)) found = o
    })
    if (!found) return
    const hand = found as THREE.Object3D
    root.updateMatrixWorld(true)
    const s = hand.getWorldScale(new THREE.Vector3()).x || 1
    this.handScale = s
    // A tablet (about 17 x 24 cm): a dark body, and a screen that glows a little.
    const [tw, th] = character.busy.tabletSize
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(tw / s, th / s, 0.008 / s),
      new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.35, metalness: 0.4 }),
    )
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry((tw - 0.012) / s, (th - 0.012) / s),
      new THREE.MeshBasicMaterial({ color: '#9fd9e6', toneMapped: true }),
    )
    // The screen is on the side facing her (the tablet's back faces the camera).
    screen.position.z = -0.0042 / s
    screen.rotation.y = Math.PI
    phone.add(screen)
    const [px, py, pz] = character.busy.phoneAt
    phone.position.set(px / s, py / s, pz / s)
    phone.rotation.set(...character.busy.phoneTurn)
    phone.scale.setScalar(0.0001)
    phone.castShadow = true
    hand.add(phone)
    this.phoneMesh = phone
    // Its screen lights her face: a soft blue-green point light just above it.
    const light = new THREE.PointLight('#5fe3d0', 0, 0.7, 2)
    light.position.set(0, 0, -0.08 / s)
    phone.add(light)
    this.phoneLight = light
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }
}

type DevHooks = { hold?: string | null; gesture?: string; poses?: Record<string, Pose>; at?: [number, number, number]; turn?: [number, number, number] }
/** Dev only: window.__actora3d, for trying poses and gestures live. */
const devHooks = (): DevHooks | undefined =>
  import.meta.env.DEV ? (window as unknown as { __actora3d?: DevHooks }).__actora3d : undefined
const devHold = () => devHooks()?.hold !== undefined
