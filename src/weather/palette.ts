import { BRAND, EXT } from '../ui/brand'
import type { Sky, SkyKind } from './sky'

/**
 * Ambient colours per sky, built from the brand palette (src/ui/brand.ts):
 * indigo, amber, rose, crimson and turquoise, with their tints for range.
 * `day` sits on the pale background; `dusk` glows on deep indigo.
 * Wendy can replace these with her own (guarded) set via `colors.set`.
 */
const SKIES: Record<SkyKind, { day: string[]; dusk: string[] }> = {
  clear: {
    day: [BRAND.amber, EXT.butter, EXT.mint, EXT.blush],
    dusk: [BRAND.indigo, BRAND.rose, BRAND.amber, BRAND.turquoise],
  },
  partly: {
    day: [EXT.mint, EXT.lavender, EXT.butter, EXT.mist],
    dusk: [EXT.indigoDeep, EXT.lavender, EXT.tealDeep, BRAND.amber],
  },
  cloudy: {
    day: [EXT.mist, EXT.lavender, '#C9C8DC', EXT.mint],
    dusk: [BRAND.indigo, EXT.ink, '#33325C', EXT.mist],
  },
  fog: {
    day: ['#DCDBE6', '#EAE9F0', EXT.mist, '#C9C8DC'],
    dusk: ['#4B4A75', '#38375F', EXT.mist, BRAND.indigo],
  },
  rain: {
    day: [EXT.tealDeep, BRAND.indigo, EXT.mint, EXT.mist],
    dusk: [EXT.ink, EXT.tealDeep, BRAND.indigo, EXT.lavender],
  },
  storm: {
    day: [BRAND.indigo, BRAND.crimson, EXT.lavender, EXT.ink],
    dusk: [EXT.ink, BRAND.indigo, BRAND.crimson, '#2A2950'],
  },
  snow: {
    day: [EXT.ice, '#E4E6F6', EXT.mint, '#EAE9F0'],
    dusk: ['#C0C3E6', EXT.mist, EXT.ice, BRAND.turquoise],
  },
}

const WARM = BRAND.amber
const COLD = EXT.mint

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

/** Temperature tint: hot days pick up amber, freezing ones mint, in the sky's units. */
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

export function blobColor(sky: Sky, slot: number, day: boolean, override?: string[] | null): string {
  const colors = override ?? skyColors(sky, day)
  const alpha = sky.kind === 'fog' || sky.kind === 'snow' ? 0.45 : day ? 0.6 : 0.55
  return hexA(colors[slot % colors.length], slot === 3 ? alpha * 0.75 : alpha)
}
