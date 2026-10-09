import { BRAND, EXT } from '../ui/brand'
import type { Sky, SkyKind } from './sky'

/**
 * Ambient colours per sky, built from the brand palette (src/ui/brand.ts):
 * navy, orange, yellow, sage and teal, with their tints for range.
 * `day` sits on the cream background; `dusk` glows on deep navy.
 */
const SKIES: Record<SkyKind, { day: string[]; dusk: string[] }> = {
  clear: {
    day: [BRAND.yellow, EXT.peach, EXT.tealLight, EXT.sageLight],
    dusk: [BRAND.orange, EXT.deepTeal, BRAND.yellow, BRAND.teal],
  },
  partly: {
    day: [EXT.tealLight, BRAND.yellow, EXT.sageLight, EXT.mist],
    dusk: [BRAND.navy, BRAND.teal, EXT.deepTeal, EXT.amber],
  },
  cloudy: {
    day: [EXT.mist, EXT.tealLight, '#C9D3D0', EXT.sageLight],
    dusk: [BRAND.navy, EXT.ink, '#2E4A57', EXT.mist],
  },
  fog: {
    day: ['#DCDCD2', '#E9E6DC', EXT.mist, '#C9D3D0'],
    dusk: ['#4E6470', '#34505E', EXT.mist, BRAND.navy],
  },
  rain: {
    day: [BRAND.teal, BRAND.navy, EXT.tealLight, EXT.mist],
    dusk: [EXT.ink, BRAND.teal, BRAND.navy, EXT.deepTeal],
  },
  storm: {
    day: [BRAND.navy, EXT.deepTeal, BRAND.orange, EXT.ink],
    dusk: [EXT.ink, BRAND.navy, EXT.ember, '#1E3440'],
  },
  snow: {
    day: [EXT.ice, '#E3EEEA', EXT.tealLight, '#E9E6DC'],
    dusk: ['#B9CFC9', EXT.mist, EXT.ice, BRAND.teal],
  },
}

const WARM = BRAND.orange
const COLD = EXT.tealLight

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

/** Temperature tint: hot days pick up orange, freezing ones pale teal, in the sky's units. */
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
