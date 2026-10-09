import type { Sky, SkyKind } from './sky'

/**
 * Ambient colours per sky, inside the app palette (apricot, sand, cream, sage,
 * slate) plus earthy extensions (clay, rose, moss, deep teal, dusty plum).
 * `day` sits on cream paper; `dusk` glows softly on deep slate-teal.
 */
const SKIES: Record<SkyKind, { day: string[]; dusk: string[] }> = {
  clear: {
    day: ['#E1A36F', '#DEC484', '#6F9F9C', '#D79A8C'],
    dusk: ['#C98A5C', '#577E89', '#6F9F9C', '#3E6A72'],
  },
  partly: {
    day: ['#DEC484', '#6F9F9C', '#577E89', '#E1A36F'],
    dusk: ['#577E89', '#6F9F9C', '#B8A06A', '#2E4A52'],
  },
  cloudy: {
    day: ['#577E89', '#6F9F9C', '#A9B4A8', '#DEC484'],
    dusk: ['#4A6268', '#577E89', '#3A5258', '#6F9F9C'],
  },
  fog: {
    day: ['#C9C5B0', '#A9B4A8', '#E2D8A5', '#8FA5A8'],
    dusk: ['#5E7275', '#7A8C8A', '#577E89', '#4A5E62'],
  },
  rain: {
    day: ['#577E89', '#6F9F9C', '#2E4A52', '#8FB0AE'],
    dusk: ['#2E4A52', '#577E89', '#3E6A72', '#6F9F9C'],
  },
  storm: {
    day: ['#2E4A52', '#577E89', '#7A6A86', '#C9765A'],
    dusk: ['#5E4A6E', '#2E4A52', '#577E89', '#A8604A'],
  },
  snow: {
    day: ['#F4F0E2', '#BFD3CF', '#E2D8A5', '#8FA5A8'],
    dusk: ['#A9C2C0', '#7E9A9A', '#E2D8A5', '#577E89'],
  },
}

const WARM = '#E39A5C'
const COLD = '#BFD8D6'

export interface Blob {
  color: string
  left: number
  top: number
  size: number
  duration: number
  delay: number
}

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`
}

/** Temperature tint: hot days pick up clay-apricot, freezing ones pale sage, in the sky's units. */
function tempAccent(sky: Sky): string | null {
  if (sky.temp === null) return null
  const c = sky.unit === 'F' ? ((sky.temp - 32) * 5) / 9 : sky.temp
  if (c >= 27) return WARM
  if (c <= 3) return COLD
  return null
}

export function skyColors(sky: Sky, day: boolean): string[] {
  const base = [...SKIES[sky.kind][day ? 'day' : 'dusk']]
  const accent = tempAccent(sky)
  if (accent) base[3] = accent
  return base
}

/**
 * A fresh random arrangement: positions, sizes, drift timing and which colour
 * lands where. Colours are assigned by index, so they can be re-tinted when the
 * weather or theme changes without re-shuffling the layout.
 */
export function randomLayout(count = 4, random = Math.random): Array<Omit<Blob, 'color'> & { slot: number }> {
  const slots = Array.from({ length: count }, (_, i) => i).sort(() => random() - 0.5)
  return slots.map((slot, i) => {
    // Spread blobs across quadrants so the field never clumps on one side.
    const qx = i % 2
    const qy = Math.floor(i / 2) % 2
    return {
      slot,
      left: qx * 45 + random() * 30 - 10,
      top: qy * 45 + random() * 30 - 10,
      size: 42 + random() * 28,
      duration: 22 + random() * 24,
      delay: -random() * 40,
    }
  })
}

export function blobColor(sky: Sky, slot: number, day: boolean): string {
  const colors = skyColors(sky, day)
  const alpha = sky.kind === 'fog' || sky.kind === 'snow' ? 0.45 : day ? 0.6 : 0.55
  return hexA(colors[slot % colors.length], slot === 3 ? alpha * 0.75 : alpha)
}
