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

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root)
    root.traverse((o) => {
      if (!this.head && character.headBone.test(o.name)) this.head = o
    })

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
    const next = this.base.get(phase)
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
    // Undo last frame's nod before the mixer writes this one (the clip may not animate the head).
    if (this.head) this.head.rotation.x -= this.nod
    this.mixer.update(dt)
    this.nod = this.speaking ? energy * 0.12 * Math.sin(this.t * 9) : 0
    if (this.head) this.head.rotation.x += this.nod
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }
}
