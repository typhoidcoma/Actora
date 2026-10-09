import type { EmotionVector, MoodState, PrimaryEmotion } from '../aelora/protocol'

export type RGB = [number, number, number]
export type Triad = [RGB, RGB, RGB]

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LIME = hex('#CDE04A')
const CORAL = hex('#FF5566')
const SKY = hex('#8FC4F0')
const COBALT = hex('#2F4FCF')
const VIOLET = hex('#7B5EA7')
const CREAM = hex('#EFEDE0')
const AMBER = hex('#FFB04A')
const DEEP = hex('#1B2A8A')

/** Orb interior colours per Plutchik emotion, built only from the house palette. */
const EMOTION_TRIADS: Record<PrimaryEmotion, Triad> = {
  joy: [LIME, AMBER, CREAM],
  trust: [SKY, COBALT, LIME],
  fear: [VIOLET, DEEP, SKY],
  surprise: [CORAL, SKY, CREAM],
  sadness: [DEEP, VIOLET, SKY],
  disgust: [hex('#8FA83A'), VIOLET, COBALT],
  anger: [CORAL, hex('#D93A2B'), AMBER],
  anticipation: [AMBER, CORAL, LIME],
}

export const NEUTRAL: Triad = [COBALT, VIOLET, LIME]

const isEmotion = (e: string): e is PrimaryEmotion => e in EMOTION_TRIADS

const mixTriad = (a: Triad, b: Triad, t: number): Triad =>
  a.map((c, i) => c.map((v, k) => v + (b[i][k] - v) * t)) as Triad

/**
 * The dominant emotion owns the palette and the runner-up tints it. Averaging
 * every emotion in RGB would pull complementary hues toward beige, so we don't.
 * Source: the continuous emotion vector when present, else the discrete mood.
 */
export function orbColors(mood: MoodState | null, emotion: EmotionVector): Triad {
  let ranked = (Object.entries(emotion) as Array<[string, number]>)
    .filter(([k, v]) => isEmotion(k) && v > 0.05)
    .sort((a, b) => b[1] - a[1]) as Array<[PrimaryEmotion, number]>

  if (!ranked.length && mood && isEmotion(String(mood.emotion))) {
    const w = mood.intensity === 'high' ? 1 : mood.intensity === 'low' ? 0.45 : 0.75
    ranked = [[mood.emotion as PrimaryEmotion, w]]
    if (mood.secondary && isEmotion(String(mood.secondary))) ranked.push([mood.secondary as PrimaryEmotion, w * 0.4])
  }
  if (!ranked.length) return NEUTRAL

  const [[top, w1], second] = ranked
  // Weak feelings stay closer to the neutral cobalt base.
  let out = mixTriad(NEUTRAL, EMOTION_TRIADS[top], Math.min(1, 0.45 + w1 * 0.7))
  if (second) out = mixTriad(out, EMOTION_TRIADS[second[0]], (second[1] / (w1 + second[1])) * 0.45)
  return out
}

export const css = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)} / ${a})`
