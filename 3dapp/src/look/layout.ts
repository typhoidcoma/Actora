import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'

type Vec3 = [number, number, number]

export interface Stage {
  /** Narrow screens stack like the 2D phone layout. */
  portrait: boolean
  card: { w: number; h: number; radius: number }
  /** Corner 0..3 → where that card stands (and, wide, turned a little toward her). */
  pose: (corner: number) => { position: Vec3; rotation: Vec3; right: boolean; bottom: boolean }
  line: { y: number; w: number; size: number }
  chips: { y: number; z: number; w: number }
  input: { y: number; z: number; w: number }
  /** What the camera must fit, and where it looks. */
  frame: { w: number; h: number; center: Vec3 }
}

const RADIUS = 0.05
export const CHIP_H = 0.115

/**
 * The 2D stage, in world units around her (she stands at the origin, 1.7 tall).
 * Wide: her line above, a 2×2 grid of cards flanking her, chips below.
 * Narrow: the 2D phone layout: her, her line, four cards stacked, chips.
 */
export function stageFor(aspect: number): Stage {
  if (aspect >= 0.8) {
    const w = 1.5
    const h = 1.02
    const rows = [1.78, 0.68]
    return {
      portrait: false,
      card: { w, h, radius: RADIUS },
      pose: (c) => {
        const right = c % 2 === 1
        const bottom = c >= 2
        return { position: [right ? 1.66 : -1.66, rows[bottom ? 1 : 0], 0], rotation: [0, right ? -0.1 : 0.1, 0], right, bottom }
      },
      line: { y: 2.56, w: 3.8, size: 0.085 },
      chips: { y: 0.08, z: 0.55, w: 3.8 },
      input: { y: -0.08, z: 0.8, w: 2.2 },
      frame: { w: 5.1, h: 3.1, center: [0, 1.18, 0] },
    }
  }
  const w = 2.5
  const h = 0.6
  const top = -0.72
  return {
    portrait: true,
    card: { w, h, radius: RADIUS },
    pose: (c) => ({ position: [0, top - c * (h + 0.06), 0], rotation: [0, 0, 0], right: false, bottom: false }),
    line: { y: -0.12, w: 2.5, size: 0.1 },
    chips: { y: top - 4 * (h + 0.06) + h / 2 - 0.02, z: 0.2, w: 2.5 },
    input: { y: top - 4 * (h + 0.06) - 0.5, z: 0.25, w: 2.5 },
    frame: { w: 2.7, h: 5.9, center: [0, -1.05, 0] },
  }
}

export function useStage(): Stage {
  const aspect = useThree((s) => s.size.width / s.size.height)
  const portrait = aspect < 0.8
  return useMemo(() => stageFor(portrait ? 0.5 : 1.6), [portrait])
}

export const FOV = 38

export interface FocusLayout {
  portrait: boolean
  /** The open panel's box, as fractions of the screen (0,0 top-left). */
  rect: { x0: number; y0: number; x1: number; y1: number }
  /** Where the camera looks, and from how far (straight down -z, no tilt). */
  target: Vec3
  dist: number
  /** The visible size of the target plane at that distance. */
  view: { w: number; h: number }
  /** The panel as it stands in the world (on the target plane, beside her). */
  panel: { position: Vec3; w: number; h: number }
}

/**
 * Focus mode, where the 3D app departs from 2D: when she brings something up
 * (chat, a card, a list, finds, the vault), the camera comes in to her, waist
 * up on the left, and the thing fills a full panel on the right. On a narrow
 * screen she stays at the top, head and shoulders, and the panel takes the rest.
 */
export function focusLayout(aspect: number): FocusLayout {
  const t = Math.tan(((FOV / 2) * Math.PI) / 180)
  const portrait = aspect < 0.8
  const viewH = portrait ? 1.9 : 1.42
  const viewW = viewH * aspect
  const dist = viewH / 2 / t
  const target: Vec3 = portrait ? [0, 1.0, 0] : [0.26 * viewW, 1.47, 0]
  const rect = portrait ? { x0: 0.03, y0: 0.3, x1: 0.97, y1: 0.985 } : { x0: 0.45, y0: 0.06, x1: 0.95, y1: 0.94 }
  const cx = (rect.x0 + rect.x1) / 2
  const cy = (rect.y0 + rect.y1) / 2
  return {
    portrait,
    rect,
    target,
    dist,
    view: { w: viewW, h: viewH },
    panel: {
      position: [target[0] + (cx - 0.5) * viewW, target[1] - (cy - 0.5) * viewH, 0],
      w: (rect.x1 - rect.x0) * viewW,
      h: (rect.y1 - rect.y0) * viewH,
    },
  }
}
