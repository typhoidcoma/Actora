import * as THREE from 'three/webgpu'

type E = [number, number, number]

/**
 * A pose: bone-local rotation offsets (radians, XYZ) layered on whatever clip is
 * playing, by bone name (the end of the name, so "RightArm" matches
 * "mixamorig:RightArm"). `wiggle` adds a sine on one axis (a wave, a laugh);
 * `hold` is how long a one-shot gesture stays up before easing out.
 * Tuned on the Mixamo skeleton (the Xbot stand-in).
 */
export interface Pose {
  bones: Record<string, E>
  wiggle?: Array<{ bone: string; axis: 0 | 1 | 2; amp: number; hz: number }>
  hold?: number
}

const FIST = (side: 'Right' | 'Left', curl = 1.3): Record<string, E> =>
  Object.fromEntries(
    ['Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [
      [`${side}Hand${f}1`, [0, 0, curl] as E],
      [`${side}Hand${f}2`, [0, 0, curl] as E],
      [`${side}Hand${f}3`, [0, 0, curl * 0.8] as E],
    ]),
  )

/** Held while she's busy (eased in, held, eased out). */
export const HOLDS: Record<string, Pose> = {
  phone: {
    bones: { RightArm: [0, 0.3, 0.4], RightForeArm: [0, 1.7, 0], RightHand: [0, -1.2, 0], Spine2: [0.1, 0, 0], Head: [0.5, 0, 0] },
  },
  think: {
    bones: {
      RightArm: [0, 0.45, 0.75],
      RightForeArm: [0, 2.35, 0],
      RightHand: [0, -0.4, 0.4],
      ...FIST('Right', 0.9),
      LeftArm: [0, -0.35, -0.3],
      LeftForeArm: [0, -1.5, 0],
      Head: [0.12, 0, 0.18],
    },
    wiggle: [{ bone: 'Head', axis: 2, amp: 0.05, hz: 0.25 }],
  },
}

/** One-shot gestures for her emoji (eased in, held, eased out). */
export const GESTURES: Record<string, Pose> = {
  // A raised fist at her shoulder, knuckles to you.
  thumbsUp: {
    bones: { RightArm: [0, 0.9, -0.4], RightForeArm: [0, 1.5, 0], RightHand: [1.2, 0, 0], ...FIST('Right'), Head: [-0.05, 0, 0.08] },
    hold: 1.3,
  },
  // Arm up (the upper arm twisted half a turn so the elbow bends upward), hand waving.
  wave: {
    bones: { RightArm: [0, 3.14, -1.2], RightForeArm: [0, 0, 1.3], Head: [0, 0, 0.1] },
    wiggle: [{ bone: 'RightForeArm', axis: 0, amp: 0.35, hz: 2.2 }],
    hold: 1.8,
  },
  celebrate: {
    bones: { RightArm: [0, 0, -1.9], LeftArm: [0, 0, 1.9], RightForeArm: [0, 0.4, 0], LeftForeArm: [0, -0.4, 0], Head: [-0.25, 0, 0] },
    wiggle: [{ bone: 'Spine2', axis: 2, amp: 0.08, hz: 2.5 }],
    hold: 1.4,
  },
  // A hand on her heart, head tilted.
  heart: {
    bones: { RightArm: [0, 0.45, 0.75], RightForeArm: [0, 1.95, 0], RightHand: [0, -0.3, 0], Head: [0.15, 0, 0.18] },
    hold: 1.6,
  },
  laugh: {
    bones: { Spine2: [-0.1, 0, 0], Head: [-0.2, 0, 0] },
    wiggle: [
      { bone: 'Spine2', axis: 0, amp: 0.07, hz: 4 },
      { bone: 'Head', axis: 0, amp: 0.08, hz: 4 },
    ],
    hold: 1.5,
  },
  // Head back, a lean back, shoulders up.
  surprise: {
    bones: { Head: [-0.3, 0, 0], Spine2: [-0.14, 0, 0], RightShoulder: [0, 0, -0.18], LeftShoulder: [0, 0, 0.18] },
    hold: 1.1,
  },
  shrug: {
    bones: { RightShoulder: [0, 0, -0.25], LeftShoulder: [0, 0, 0.25], Head: [0, 0, 0.25], Spine2: [0, 0, 0.05] },
    hold: 1.3,
  },
  nod: {
    bones: {},
    wiggle: [{ bone: 'Head', axis: 0, amp: 0.18, hz: 2.2 }],
    hold: 1,
  },
  shake: {
    bones: {},
    wiggle: [{ bone: 'Head', axis: 1, amp: 0.22, hz: 2.4 }],
    hold: 1,
  },
  think: { ...HOLDS.think, hold: 1.6 },
}

/** Emoji → gesture. Anything else gets a nod: she acknowledged it. */
const EMOJI: Array<[RegExp, string]> = [
  [/👍|👌|💪|✅|☑️|✔️/u, 'thumbsUp'],
  [/👋|🙋/u, 'wave'],
  [/🎉|🥳|🙌|🎊|🏆|🚀|✨|🔥/u, 'celebrate'],
  [/❤|💖|💕|💗|🥰|😍|🫶|💜|💙|💚|🧡|🤍/u, 'heart'],
  [/😂|🤣|😆|😄|😁|😹/u, 'laugh'],
  [/😮|😲|🤯|😱|😳|👀|❗|‼️/u, 'surprise'],
  [/🤷/u, 'shrug'],
  [/🤔|🧐|💭/u, 'think'],
  [/👎|🙅|❌|🚫/u, 'shake'],
]
export const gestureFor = (emoji: string): string => EMOJI.find(([re]) => re.test(emoji))?.[1] ?? 'nod'

/** Every bone any pose touches (looked up once). */
export const POSED_BONES = [
  ...new Set(
    [...Object.values(HOLDS), ...Object.values(GESTURES)].flatMap((p) => [...Object.keys(p.bones), ...(p.wiggle ?? []).map((w) => w.bone)]),
  ),
]

/**
 * A layer of pose offsets over the mixer: one pose at a time, its weight eased
 * in and out; switching poses eases the old one out first. Undo() before the
 * mixer writes, apply() after.
 */
export class PoseLayer {
  private applied = new Map<THREE.Object3D, THREE.Quaternion>()
  private pose: Pose | null = null
  private next: Pose | null = null
  w = 0
  private target = 0
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()

  private bones: Map<string, THREE.Object3D>
  private speed: number

  constructor(bones: Map<string, THREE.Object3D>, speed = 5) {
    this.bones = bones
    this.speed = speed
  }

  /** Show this pose (or none); eases the current one out first if it's different. */
  set(pose: Pose | null): void {
    if (pose === this.pose) {
      this.target = pose ? 1 : 0
      this.next = null
      return
    }
    if (!this.pose || this.w < 0.02) {
      this.pose = pose
      this.next = null
      this.target = pose ? 1 : 0
    } else {
      this.next = pose
      this.target = 0
    }
  }

  get current(): Pose | null {
    return this.next ?? this.pose
  }

  undo(): void {
    for (const [bone, q] of this.applied) bone.quaternion.multiply(this.q.copy(q).invert())
    this.applied.clear()
  }

  apply(dt: number, t: number, scale = 1): void {
    this.w += (this.target - this.w) * (1 - Math.exp(-dt * this.speed))
    if (this.next !== null || (this.target === 0 && this.pose)) {
      if (this.w < 0.02) {
        this.pose = this.next
        this.next = null
        this.w = 0
        this.target = this.pose ? 1 : 0
      }
    }
    const pose = this.pose
    const w = this.w * scale
    if (!pose || w < 0.002) return
    const offsets = new Map<string, E>(Object.entries(pose.bones).map(([k, v]) => [k, [...v] as E]))
    for (const wg of pose.wiggle ?? []) {
      const o = offsets.get(wg.bone) ?? [0, 0, 0]
      o[wg.axis] += Math.sin(t * wg.hz * Math.PI * 2) * wg.amp
      offsets.set(wg.bone, o)
    }
    for (const [name, o] of offsets) {
      const bone = this.bones.get(name)
      if (!bone) continue
      const q = new THREE.Quaternion().slerp(this.q.setFromEuler(this.e.set(o[0], o[1], o[2])), w)
      bone.quaternion.multiply(q)
      this.applied.set(bone, q)
    }
  }
}
