/**
 * Which GLB to load and how its clips map onto the agent's states. Clip names are
 * matched case-insensitively, first hit wins; a state with no matching clip falls
 * back to idle. Rename here when the real character's clips arrive.
 */
export const character = {
  url: import.meta.env.VITE_CHARACTER_URL?.trim() || '/models/character.glb',
  placeholderUrl: '/models/placeholder.glb',
  /**
   * Extra clips to load onto her (GLB or FBX, e.g. Mixamo downloads "Without Skin"),
   * named after their files: `/models/clips/texting.fbx` becomes the "texting" clip,
   * which the busy phone routine uses over the procedural pose.
   */
  clips: [] as string[],
  /** World height the model is scaled to (metres), whatever units it was exported in. */
  height: 1.7,
  /** One plain colour over every material for now (no textures); null keeps the model's own. */
  tint: '#e6e6e6' as string | null,

  /** Looping base clip per agent phase. */
  base: {
    offline: ['sleep', 'offline', 'idle'],
    idle: ['idle'],
    thinking: ['think', 'thinking', 'idle'],
    tool: ['work', 'tool', 'think', 'idle'],
    speaking: ['talk', 'talking', 'speak', 'idle'],
  },

  /** One-shot emotes layered additively over the base for avatar.react (by reaction bus). */
  emotes: {
    positive: ['happy', 'nod', 'agree'],
    negative: ['sad', 'headshake', 'sad_pose'],
    cognitive: ['curious', 'think_emote', 'headshake'],
  },

  /**
   * What she does while she's off working at home (bridge/wander.ts): her walk
   * clip, a phone clip if the model has one (e.g. Mixamo's "Texting While
   * Standing"), and otherwise a procedural phone pose: bone-local rotation
   * offsets (radians) and where the phone sits in her right hand (metres).
   */
  busy: {
    walk: ['walk', 'walking'],
    phone: ['phone', 'texting', 'looking_at_phone'],
    // Tuned for the Mixamo skeleton (the Xbot stand-in): hand at her chest, palm up, head down.
    // Dev: `__actora3d = { pose: {...}, at: [...], turn: [...], phone: true }` retunes live.
    pose: {
      RightArm: [0, 0.3, 0.4],
      RightForeArm: [0, 1.7, 0],
      RightHand: [0, -1.2, 0],
      Spine2: [0.1, 0, 0],
      Head: [0.5, 0, 0],
    } as Record<string, [number, number, number]>,
    phoneAt: [0, -0.05, 0.02] as [number, number, number],
    phoneTurn: [0, 0, 0] as [number, number, number],
  },

  /** Bone the speaking motion nods (regex on bone names). */
  headBone: /head$/i,
} as const

export type Phase = keyof typeof character.base
