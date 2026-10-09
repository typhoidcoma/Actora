import type { Sky, SkyKind } from './sky'

/**
 * Ambient colours per sky, inside the app palette (smoke, bristle, daylily, red,
 * midnight) plus extensions (dusty rose, sand, deep mint, plum).
 * `day` sits on Hog Bristle paper; `dusk` glows softly on Midnight Affair.
 */
const SKIES: Record<SkyKind, { day: string[]; dusk: string[] }> = {
  clear: {
    day: ['#EB7B59', '#CDBFA3', '#A7C5BD', '#D9A5A0'],
    dusk: ['#C96A50', '#8A7690', '#A7C5BD', '#6B5470'],
  },
  partly: {
    day: ['#CDBFA3', '#A7C5BD', '#D9A5A0', '#EB7B59'],
    dusk: ['#8A7690', '#6E9C92', '#B08A80', '#4A3E52'],
  },
  cloudy: {
    day: ['#A7C5BD', '#B8B0A8', '#8A7690', '#CDBFA3'],
    dusk: ['#5E5266', '#6E8A86', '#4A3E52', '#7A6E80'],
  },
  fog: {
    day: ['#D6CEC0', '#B8C8C2', '#E5DDCB', '#A8A0A8'],
    dusk: ['#6A6070', '#7E8A88', '#5A5060', '#8A8088'],
  },
  rain: {
    day: ['#6E9C92', '#A7C5BD', '#524656', '#8FB0AA'],
    dusk: ['#3E5A58', '#524656', '#6E9C92', '#4A3E52'],
  },
  storm: {
    day: ['#524656', '#6E9C92', '#8A7690', '#CF4647'],
    dusk: ['#5E3E5A', '#3A3044', '#6E9C92', '#A83E40'],
  },
  snow: {
    day: ['#F4EEE2', '#C8DAD4', '#E5DDCB', '#A8B8C0'],
    dusk: ['#B8CCC6', '#8A9A98', '#E5DDCB', '#7A6E80'],
  },
}

const WARM = '#EB7B59'
const COLD = '#C8DAD4'

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
