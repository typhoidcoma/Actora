/**
 * Which GLB to load and how its clips map onto the agent's states. Clip names are
 * matched case-insensitively, first hit wins; a state with no matching clip falls
 * back to idle. Rename here when the real character's clips arrive.
 */
export const character = {
  url: import.meta.env.VITE_CHARACTER_URL?.trim() || '/models/character.glb',
  placeholderUrl: '/models/placeholder.glb',
  /** World height the model is scaled to (metres), whatever units it was exported in. */
  height: 1.7,

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

  /** Bone the speaking motion nods (regex on bone names). */
  headBone: /head$/i,
} as const

export type Phase = keyof typeof character.base
