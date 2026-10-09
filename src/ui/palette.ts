import type { EmotionVector, MoodState, PrimaryEmotion } from '../aelora/protocol'

export type RGB = [number, number, number]
export type Triad = [RGB, RGB, RGB]

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// App palette + earthy extensions (see styles/index.css).
const APRICOT = hex('#E1A36F')
const SAND = hex('#DEC484')
const CREAM = hex('#F1E8CC')
const SAGE = hex('#6F9F9C')
const SLATE = hex('#577E89')
const CLAY = hex('#C9765A')
const ROSE = hex('#D79A8C')
const MOSS = hex('#8C9A6B')
const DEEP = hex('#2E4A52')
const PLUM = hex('#7A6A86')

/** Orb interior colours per Plutchik emotion, all inside the app palette. */
const EMOTION_TRIADS: Record<PrimaryEmotion, Triad> = {
  joy: [APRICOT, SAND, CREAM],
  trust: [SAGE, SLATE, CREAM],
  fear: [PLUM, DEEP, SAGE],
  surprise: [ROSE, SAND, CREAM],
  sadness: [SLATE, DEEP, SAGE],
  disgust: [MOSS, DEEP, SAND],
  anger: [CLAY, APRICOT, ROSE],
  anticipation: [SAND, APRICOT, SAGE],
}

export const NEUTRAL: Triad = [SAGE, SLATE, CREAM]

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
