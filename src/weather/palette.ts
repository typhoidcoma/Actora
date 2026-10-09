import { BRAND, EXT } from '../ui/brand'
import type { Sky, SkyKind } from './sky'

/**
 * Ambient colours per sky, built from the brand palette (src/ui/brand.ts):
 * blue, green, pink and slate, with violet, cyan, lime and navy for range.
 * `day` sits on the cool light background; `dusk` glows on deep slate.
 */
const SKIES: Record<SkyKind, { day: string[]; dusk: string[] }> = {
  clear: {
    day: [BRAND.blue, EXT.cyan, BRAND.green, EXT.rose],
    dusk: [BRAND.blue, EXT.violet, EXT.cyan, BRAND.pink],
  },
  partly: {
    day: [EXT.cyan, BRAND.blue, EXT.slateLight, BRAND.green],
    dusk: [EXT.navy, BRAND.blue, BRAND.slate, EXT.violet],
  },
  cloudy: {
    day: [EXT.slateLight, BRAND.blue, '#C3C6E0', EXT.violet],
    dusk: [BRAND.slate, EXT.navy, '#2C3270', EXT.slateLight],
  },
  fog: {
    day: ['#DCD8E6', '#E8E4EC', EXT.slateLight, '#C3C6E0'],
    dusk: ['#4A4F82', '#343A6E', EXT.slateLight, BRAND.slate],
  },
  rain: {
    day: [BRAND.blue, EXT.navy, EXT.cyan, EXT.slateLight],
    dusk: [EXT.navy, BRAND.blue, BRAND.slate, EXT.cyan],
  },
  storm: {
    day: [EXT.navy, EXT.violet, BRAND.pink, BRAND.slate],
    dusk: [EXT.violet, EXT.navy, BRAND.pink, '#2A2F6A'],
  },
  snow: {
    day: [EXT.ice, '#D4E6FF', EXT.cyan, '#E8E4EC'],
    dusk: ['#B4C8F2', EXT.slateLight, EXT.ice, BRAND.blue],
  },
}

const WARM = BRAND.pink
const COLD = EXT.cyan

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

/** Temperature tint: hot days pick up hot pink, freezing ones sky blue, in the sky's units. */
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
