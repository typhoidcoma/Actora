import * as THREE from 'three/webgpu'
import type { ReactionBus } from '@actora/aelora/protocol'
import { character, type Phase } from '../character'

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
  /** The procedural phone pose: bones, their offsets, how far in (0..1), and the phone itself. */
  private pose: Array<{ bone: THREE.Object3D; off: THREE.Quaternion; applied: THREE.Quaternion }> = []
  private poseW = 0
  private phoneTarget = 0
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
    if (!this.phoneClip) this.buildPhonePose(root)
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
   * What she's doing beyond her phase: 'walk', 'phone', or null (back to the
   * phase loop). A phone without a phone clip is the procedural pose instead.
   */
  setActivity(kind: 'walk' | 'phone' | null): void {
    this.phoneTarget = kind === 'phone' && !this.phoneClip ? 1 : 0
    const names = kind === 'walk' ? character.busy.walk : kind === 'phone' ? character.busy.phone : null
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
    for (const p of this.pose) p.bone.quaternion.multiply(p.applied.clone().invert())
    this.mixer.update(dt)

    // Dev: `__actora3d.pose = { RightArm: [x, y, z], … }` retunes the pose live.
    const dev = import.meta.env.DEV ? (window as unknown as { __actora3d?: { pose?: Record<string, [number, number, number]>; phone?: boolean } }).__actora3d : undefined
    if (dev?.pose) for (const p of this.pose) { const e = dev.pose[p.bone.name.replace(/^mixamorig/, '')]; if (e) p.off.setFromEuler(new THREE.Euler(e[0], e[1], e[2])) }
    if (dev?.phone !== undefined) this.phoneTarget = dev.phone ? 1 : 0
    const devAt = (dev as { at?: [number, number, number]; turn?: [number, number, number] } | undefined)
    if (this.phoneMesh && devAt?.at) this.phoneMesh.position.set(...devAt.at).divideScalar(this.handScale)
    if (this.phoneMesh && devAt?.turn) this.phoneMesh.rotation.set(...devAt.turn)
    // The phone pose eases in and out (about half a second), the phone with it.
    this.poseW += (this.phoneTarget - this.poseW) * (1 - Math.exp(-dt * 5))
    const w = this.poseW < 0.002 ? 0 : this.poseW
    for (const p of this.pose) {
      p.applied.identity().slerp(p.off, w)
      p.bone.quaternion.multiply(p.applied)
    }
    if (this.phoneMesh) this.phoneMesh.visible = w > 0.35
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

  /** Bone-local offsets for "looking at her phone" (character.busy.pose), and a phone in her hand. */
  private buildPhonePose(root: THREE.Object3D): void {
    const find = (re: RegExp) => {
      let hit: THREE.Object3D | null = null
      root.traverse((o) => {
        if (!hit && re.test(o.name)) hit = o
      })
      return hit as THREE.Object3D | null
    }
    for (const [name, e] of Object.entries(character.busy.pose)) {
      const bone = find(new RegExp(`${name}$`))
      if (!bone) continue
      this.pose.push({ bone, off: new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])), applied: new THREE.Quaternion() })
    }
    const hand = find(/RightHand$/)
    if (!hand) return
    root.updateMatrixWorld(true)
    const s = hand.getWorldScale(new THREE.Vector3()).x || 1
    this.handScale = s
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.072 / s, 0.15 / s, 0.009 / s),
      new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.35, metalness: 0.4 }),
    )
    const [px, py, pz] = character.busy.phoneAt
    phone.position.set(px / s, py / s, pz / s)
    phone.rotation.set(...character.busy.phoneTurn)
    phone.visible = false
    phone.castShadow = true
    hand.add(phone)
    this.phoneMesh = phone
    // Its screen lights her face: a small blue-green point light just above the phone.
    const light = new THREE.PointLight('#5fe3d0', 0, 0.55, 2)
    light.position.set(0, 0, 0.06 / s)
    phone.add(light)
    this.phoneLight = light
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }
}
