import type { EmotionVector, MoodState, PrimaryEmotion } from '../aelora/protocol'
import { clamp, hexToOklch, type Oklch, oklchToHex, parseHex } from '../color/oklch'
import type { Role, Scheme } from '../color/scheme'
import { useScheme } from '../stores/scheme'

export type RGB = [number, number, number]
export type Triad = [RGB, RGB, RGB]

const rgb = (hex: string): RGB => parseHex(hex) ?? [0.5, 0.5, 0.5]

/**
 * Orb colours per Plutchik emotion, as roles of the live scheme (brand or
 * Wendy's), so her moods always belong to whatever palette is on screen.
 * Each entry: [role, lightness shift, chroma scale]; results are kept in a
 * glow-friendly band (L 0.5–0.95, C ≤ 0.2) so no mood turns muddy or neon.
 * Cross-family triads (amber + turquoise) are intentional: the swirl blends them.
 */
type Tone = [Role, number, number]
const EMOTIONS: Record<PrimaryEmotion, [Tone, Tone, Tone]> = {
  joy: [
    ['mid', 0.04, 1],
    ['mid', 0.16, 0.6],
    ['calm', 0.12, 0.5],
  ],
  trust: [
    ['accent', 0, 1],
    ['calm', 0.12, 0.7],
    ['accent', 0.22, 0.25],
  ],
  fear: [
    ['wendy', 0.1, 1],
    ['event', 0.24, 0.7],
    ['wendy', -0.04, 0.8],
  ],
  surprise: [
    ['finds', 0.06, 1],
    ['mid', 0.08, 0.9],
    ['mid', 0.2, 0.4],
  ],
  sadness: [
    ['event', 0.12, 0.8],
    ['wendy', 0.26, 0.35],
    ['event', 0.2, 0.6],
  ],
  disgust: [
    ['calm', -0.12, 0.7],
    ['event', 0.12, 0.7],
    ['calm', 0.06, 0.35],
  ],
  anger: [
    ['urgent', 0, 1],
    ['reminder', 0.06, 1],
    ['mid', 0, 0.9],
  ],
  anticipation: [
    ['mid', 0, 1],
    ['accent', 0.04, 1],
    ['accent', 0.22, 0.3],
  ],
}

function tone(base: Record<Role, string>, [role, dl, dc]: Tone): string {
  const c = hexToOklch(base[role]) as Oklch
  return oklchToHex({ l: clamp(c.l + dl, 0.5, 0.95), c: Math.min(c.c * dc, 0.2), h: c.h })
}

/** Triads for the current scheme, rebuilt only when the scheme changes. */
let cache: { scheme: Scheme; triads: Record<PrimaryEmotion, string[]>; neutral: string[] } | null = null
function triads(scheme: Scheme) {
  if (cache?.scheme === scheme) return cache
  const b = scheme.base
  const t = Object.fromEntries(
    (Object.keys(EMOTIONS) as PrimaryEmotion[]).map((e) => [e, EMOTIONS[e].map((x) => tone(b, x))]),
  ) as Record<PrimaryEmotion, string[]>
  // At rest: the accent, a soft tint of Wendy's own colour, and a near-white highlight.
  const neutral = scheme.orb ?? [
    tone(b, ['accent', 0, 1]),
    tone(b, ['wendy', 0.28, 0.6]),
    tone(b, ['accent', 0.3, 0.15]),
  ]
  cache = { scheme, triads: t, neutral }
  return cache
}

const isEmotion = (e: string): e is PrimaryEmotion => e in EMOTIONS

/**
 * Mixed like light: lightness and chroma interpolate on their own and hue
 * takes the short way round, so amber → turquoise passes through a vivid
 * green-gold instead of the grey an OKLab or sRGB average lands on.
 */
function mix(a: string, b: string, t: number): string {
  const x = hexToOklch(a) as Oklch
  const y = hexToOklch(b) as Oklch
  // A near-grey has no meaningful hue; borrow the other colour's.
  const hx = x.c < 0.02 ? y.h : x.h
  const hy = y.c < 0.02 ? x.h : y.h
  const dh = ((((hy - hx) % 360) + 540) % 360) - 180
  return oklchToHex({
    l: x.l + (y.l - x.l) * t,
    c: x.c + (y.c - x.c) * t,
    h: (((hx + dh * t) % 360) + 360) % 360,
  })
}
const mixTriad = (a: string[], b: string[], t: number) => a.map((c, i) => mix(c, b[i], t))

/** The emotions in play, strongest first, from the live vector or else the discrete mood. */
function ranked(mood: MoodState | null, emotion: EmotionVector): Array<[PrimaryEmotion, number]> {
  let out = (Object.entries(emotion) as Array<[string, number]>)
    .filter(([k, v]) => isEmotion(k) && v > 0.05)
    .sort((a, b) => b[1] - a[1]) as Array<[PrimaryEmotion, number]>
  if (!out.length && mood && isEmotion(String(mood.emotion))) {
    const w = mood.intensity === 'high' ? 1 : mood.intensity === 'low' ? 0.45 : 0.75
    out = [[mood.emotion as PrimaryEmotion, w]]
    if (mood.secondary && isEmotion(String(mood.secondary))) out.push([mood.secondary as PrimaryEmotion, w * 0.4])
  }
  return out
}

/**
 * The dominant emotion owns the palette and the runner-up tints it. Averaging
 * every emotion would pull complementary hues toward beige, so we don't.
 * Weak feelings stay close to her resting colours.
 */
export function orbColors(
  mood: MoodState | null,
  emotion: EmotionVector,
  scheme: Scheme = useScheme.getState().scheme,
): Triad {
  const t = triads(scheme)
  const r = ranked(mood, emotion)
  if (!r.length) return t.neutral.map(rgb) as Triad
  const [[top, w1], second] = r
  let out = mixTriad(t.neutral, t.triads[top], Math.min(1, 0.45 + w1 * 0.7))
  if (second) out = mixTriad(out, t.triads[second[0]], (second[1] / (w1 + second[1])) * 0.45)
  return out.map(rgb) as Triad
}

/** How strongly she feels right now, 0..1: drives how brightly her mood lights the room. */
export function moodIntensity(mood: MoodState | null, emotion: EmotionVector): number {
  const r = ranked(mood, emotion)
  if (!r.length) return 0
  // The live vector is often small (0.05–0.3); lift it so a real feeling is visible.
  return clamp(Math.sqrt(r[0][1]) * 1.15, 0, 1)
}

export const css = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)} / ${a})`
