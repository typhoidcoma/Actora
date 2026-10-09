import type { Sky, SkyKind } from './sky'

/** Ambient colours per sky. Deep and saturated: they sit behind dark glass. */
const SKIES: Record<SkyKind, { day: string[]; night: string[] }> = {
  clear: {
    day: ['#2F7FEF', '#FFB547', '#8FC4F0', '#CDE04A'],
    night: ['#1B2A8A', '#7B5EA7', '#3E8FB8', '#2F4FCF'],
  },
  partly: {
    day: ['#4E8FD8', '#9AA7BD', '#E8B66A', '#2F4FCF'],
    night: ['#26357A', '#5B6077', '#6F5AA0', '#1B2A8A'],
  },
  cloudy: {
    day: ['#5A6884', '#8792A8', '#3E4A6A', '#6F7A92'],
    night: ['#2E3550', '#4A5068', '#262B44', '#3B3F5C'],
  },
  fog: {
    day: ['#8A94A6', '#B3BAC6', '#6A7484', '#9AA2B0'],
    night: ['#4A5262', '#636B7A', '#363C4A', '#525A6A'],
  },
  rain: {
    day: ['#1F6F8A', '#345C9C', '#2A4670', '#4B8FB0'],
    night: ['#14485E', '#22407A', '#1A2B4E', '#2E5F80'],
  },
  storm: {
    day: ['#5B2A86', '#3C2BD1', '#2A1F5E', '#7B5EA7'],
    night: ['#3F1C66', '#2A1FA0', '#160F38', '#5B3F8A'],
  },
  snow: {
    day: ['#A9C8E8', '#DCE6F2', '#6E8FB8', '#C3D4EA'],
    night: ['#5D7699', '#8EA2BF', '#3E5578', '#71869F'],
  },
}

const WARM = '#FF8A3D'
const COLD = '#7FD4F5'

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

/** Temperature tint: hot days pick up amber, cold ones ice, in the sky's units. */
function tempAccent(sky: Sky): string | null {
  if (sky.temp === null) return null
  const c = sky.unit === 'F' ? ((sky.temp - 32) * 5) / 9 : sky.temp
  if (c >= 27) return WARM
  if (c <= 3) return COLD
  return null
}

export function skyColors(sky: Sky): string[] {
  const base = [...SKIES[sky.kind][sky.isDay ? 'day' : 'night']]
  const accent = tempAccent(sky)
  if (accent) base[3] = accent
  return base
}

/**
 * A fresh random arrangement: positions, sizes, drift timing and which colour
 * lands where. Colours are assigned by index, so they can be re-tinted when the
 * weather changes without re-shuffling the layout.
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

export function blobColor(sky: Sky, slot: number): string {
  const colors = skyColors(sky)
  const alpha = sky.kind === 'fog' || sky.kind === 'snow' ? 0.32 : sky.isDay ? 0.68 : 0.58
  return hexA(colors[slot % colors.length], slot === 3 ? alpha * 0.7 : alpha)
}
