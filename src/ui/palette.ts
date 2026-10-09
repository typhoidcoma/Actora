import type { EmotionVector, MoodState, PrimaryEmotion } from '../aelora/protocol'

export type RGB = [number, number, number]
export type Triad = [RGB, RGB, RGB]

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// App palette + extensions (see styles/index.css).
const SMOKE = hex('#A7C5BD')
const BRISTLE = hex('#E5DDCB')
const DAYLILY = hex('#EB7B59')
const RED = hex('#CF4647')
const MIDNIGHT = hex('#524656')
const ROSE = hex('#D9A5A0')
const SAND = hex('#CDBFA3')
const MINT = hex('#6E9C92')
const PLUM = hex('#8A7690')
const CREAM = hex('#F4EEE2')

/** Orb interior colours per Plutchik emotion, all inside the app palette. */
const EMOTION_TRIADS: Record<PrimaryEmotion, Triad> = {
  joy: [DAYLILY, SAND, CREAM],
  trust: [SMOKE, MINT, CREAM],
  fear: [PLUM, MIDNIGHT, SMOKE],
  surprise: [ROSE, DAYLILY, CREAM],
  sadness: [MIDNIGHT, PLUM, SMOKE],
  disgust: [MINT, MIDNIGHT, SAND],
  anger: [RED, DAYLILY, ROSE],
  anticipation: [SAND, DAYLILY, SMOKE],
}

export const NEUTRAL: Triad = [SMOKE, PLUM, BRISTLE]

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
