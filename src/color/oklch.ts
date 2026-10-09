// Colour science in OKLCH (Björn Ottosson's OKLab, polar form). Perceptually
// even: equal steps of L look like equal steps of lightness, and hue holds
// steady while lightness and chroma move, so guardrails can nudge one axis
// without the colour turning into something else.

export interface Oklch {
  /** Lightness 0..1 */
  l: number
  /** Chroma 0..~0.37 */
  c: number
  /** Hue in degrees 0..360 */
  h: number
}

type Rgb = [number, number, number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** Parses #rgb / #rrggbb (case-insensitive). Anything else is null. */
export function parseHex(input: unknown): Rgb | null {
  if (typeof input !== 'string') return null
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const n = parseInt(h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function linearToOklab([r, g, b]: Rgb): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [L, a, b] = linearToOklab(rgb.map(toLinear) as Rgb)
  const c = Math.hypot(a, b)
  const h = c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const r = (h * Math.PI) / 180
  return oklabToLinear(l, c * Math.cos(r), c * Math.sin(r))
}

const EPS = 1e-4
const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -EPS && v <= 1 + EPS)

/**
 * Brings a colour into sRGB by lowering chroma only (hue and lightness are
 * what people recognise; chroma is what the screen can't show).
 */
export function gamutMap(color: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, color.l))
  const base = { ...color, l }
  if (inGamut(oklchToLinear(base))) return base
  let lo = 0
  let hi = base.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinear({ ...base, c: mid }))) lo = mid
    else hi = mid
  }
  return { ...base, c: lo }
}

export function oklchToHex(color: Oklch): string {
  const rgb = oklchToLinear(gamutMap(color))
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

/** WCAG 2 relative luminance. */
function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/**
 * The same hue and chroma, moved along lightness (away from the background)
 * just far enough to reach `min` contrast. Chroma falls back where the gamut
 * forces it, so the result is the closest readable relative of the input.
 */
export function ensureContrast(hex: string, bg: string, min: number): string {
  if (contrast(hex, bg) >= min) return hex
  const c = hexToOklch(hex)
  if (!c) return hex
  const darken = luminance(bg) > 0.18
  let lo = darken ? 0 : c.l
  let hi = darken ? c.l : 1
  let best = darken ? '#000000' : '#ffffff'
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const out = oklchToHex({ ...c, l: mid })
    if (contrast(out, bg) >= min) {
      best = out
      // Closest passing lightness to the original.
      if (darken) lo = mid
      else hi = mid
    } else if (darken) hi = mid
    else lo = mid
  }
  return best
}

/** Perceptual distance (ΔE in OKLab). ~0.02 is barely visible; 0.1 reads as a different colour. */
export function deltaE(a: Oklch, b: Oklch): number {
  const ra = (a.h * Math.PI) / 180
  const rb = (b.h * Math.PI) / 180
  return Math.hypot(a.l - b.l, a.c * Math.cos(ra) - b.c * Math.cos(rb), a.c * Math.sin(ra) - b.c * Math.sin(rb))
}

/** Shortest signed distance between two hues, in degrees (-180..180]. */
export function hueDiff(a: number, b: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return d === -180 ? 180 : d
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** `rgb(r g b / a)` from a hex, for translucent tokens. */
export function rgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0]
  const [r, g, b] = rgb.map((v) => Math.round(v * 255))
  return `rgb(${r} ${g} ${b} / ${alpha})`
}
