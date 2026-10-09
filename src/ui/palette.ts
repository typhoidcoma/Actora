import type { EmotionVector, MoodState, PrimaryEmotion } from '../aelora/protocol'
import { useScheme } from '../stores/scheme'
import { BRAND, EXT } from './brand'

export type RGB = [number, number, number]
export type Triad = [RGB, RGB, RGB]

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Brand palette + extensions (src/ui/brand.ts).
const INDIGO = hex(BRAND.indigo)
const AMBER = hex(BRAND.amber)
const ROSE = hex(BRAND.rose)
const CRIMSON = hex(BRAND.crimson)
const TURQUOISE = hex(BRAND.turquoise)
const LAVENDER = hex(EXT.lavender)
const INK = hex(EXT.ink)
const MIST = hex(EXT.mist)
const BUTTER = hex(EXT.butter)
const APRICOT = hex(EXT.apricot)
const MINT = hex(EXT.mint)
const TEAL_DEEP = hex(EXT.tealDeep)
const ICE = hex(EXT.ice)

/** Orb interior colours per Plutchik emotion, all inside the brand palette. */
const EMOTION_TRIADS: Record<PrimaryEmotion, Triad> = {
  joy: [AMBER, BUTTER, MINT],
  trust: [TURQUOISE, MINT, ICE],
  fear: [INDIGO, LAVENDER, INK],
  surprise: [ROSE, AMBER, BUTTER],
  sadness: [INDIGO, MIST, LAVENDER],
  disgust: [TEAL_DEEP, INDIGO, MIST],
  anger: [CRIMSON, ROSE, APRICOT],
  anticipation: [AMBER, TURQUOISE, ICE],
}

export const NEUTRAL: Triad = [TURQUOISE, LAVENDER, ICE]

const isEmotion = (e: string): e is PrimaryEmotion => e in EMOTION_TRIADS

const mixTriad = (a: Triad, b: Triad, t: number): Triad =>
  a.map((c, i) => c.map((v, k) => v + (b[i][k] - v) * t)) as Triad

/**
 * The dominant emotion owns the palette and the runner-up tints it. Averaging
 * every emotion in RGB would pull complementary hues toward beige, so we don't.
 * Source: the continuous emotion vector when present, else the discrete mood.
 */
export function orbColors(
  mood: MoodState | null,
  emotion: EmotionVector,
  rest: string[] | null = useScheme.getState().scheme.orb,
): Triad {
  // Wendy can set the orb's resting colours (already guarded by the scheme engine).
  const neutral = rest ? (rest.map(hex) as Triad) : NEUTRAL
  let ranked = (Object.entries(emotion) as Array<[string, number]>)
    .filter(([k, v]) => isEmotion(k) && v > 0.05)
    .sort((a, b) => b[1] - a[1]) as Array<[PrimaryEmotion, number]>

  if (!ranked.length && mood && isEmotion(String(mood.emotion))) {
    const w = mood.intensity === 'high' ? 1 : mood.intensity === 'low' ? 0.45 : 0.75
    ranked = [[mood.emotion as PrimaryEmotion, w]]
    if (mood.secondary && isEmotion(String(mood.secondary))) ranked.push([mood.secondary as PrimaryEmotion, w * 0.4])
  }
  if (!ranked.length) return neutral

  const [[top, w1], second] = ranked
  // Weak feelings stay closer to the neutral teal base.
  let out = mixTriad(neutral, EMOTION_TRIADS[top], Math.min(1, 0.45 + w1 * 0.7))
  if (second) out = mixTriad(out, EMOTION_TRIADS[second[0]], (second[1] / (w1 + second[1])) * 0.45)
  return out
}

export const css = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)} / ${a})`
