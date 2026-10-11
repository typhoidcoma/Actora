import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'

type Vec3 = [number, number, number]

interface Placed {
  position: Vec3
  rotation: Vec3
  /** Uniform scale on top of the canonical sizes the painters draw at. */
  scale: number
}

export interface Stage {
  /** Narrow screens stack like the 2D phone layout. */
  portrait: boolean
  /** Card size in canonical units (what the painters draw at; `pose().scale` sizes it in the room). */
  card: { w: number; h: number; radius: number }
  /** Corner 0..3 → where that card stands (wide: turned a little toward her). */
  pose: (corner: number) => Placed & { right: boolean; bottom: boolean }
  line: Placed & { w: number; size: number }
  chips: Placed & { w: number }
  input: Placed & { w: number }
  /** Where she stands. */
  her: Vec3
  /** Wide: what the camera must fit, and where it looks. */
  frame: { w: number; h: number; center: Vec3 }
  /** Portrait: a fixed camera (the room seen from above, her up on the platform). */
  camera?: { position: Vec3; target: Vec3 }
}

const RADIUS = 0.05
export const CHIP_H = 0.115
export const FOV = 38
const T = Math.tan(((FOV / 2) * Math.PI) / 180)

/**
 * Portrait: a close camera at about her eye line, so a phone shows her head and
 * shoulders in its top third (not her whole body); the phone stack stands
 * between her and the camera and covers the rest of her.
 */
export const PORTRAIT = {
  her: [0, 0, 0] as Vec3,
  camera: { position: [0, 1.45, 2.6] as Vec3, target: [0, 1.0, 0] as Vec3 },
  /** How far in front of the camera the phone stack stands (in front of her). */
  depth: 1.6,
}

/**
 * The 2D stage, in the room around her.
 * Wide: her line above, a 2×2 grid of cards flanking her, chips below; she's at the origin.
 * Narrow (the 2D phone layout): her head and shoulders at the top, then her line, the
 * four cards, the chips and the input stacked in front of her, each placed by its
 * share of the screen and facing the camera.
 */
export function stageFor(aspect: number): Stage {
  if (aspect >= 0.8) {
    // Smaller cards, closer to her, and a camera that comes in a little: she's the subject.
    const w = 1.3
    const h = 0.88
    // She's the subject: the camera is in close (she fills most of the height), and the
    // cards, painted at their canonical size, are shown small beside her (type and all).
    const rows = [1.4, 1.0]
    const cardScale = 0.44
    return {
      portrait: false,
      card: { w, h, radius: RADIUS },
      pose: (c) => {
        const right = c % 2 === 1
        const bottom = c >= 2
        return { position: [right ? 0.98 : -0.98, rows[bottom ? 1 : 0], 0], rotation: [0, right ? -0.12 : 0.12, 0], scale: cardScale, right, bottom }
      },
      line: { position: [0, 1.95, 0.05], rotation: [0, 0, 0], scale: 1, w: 2.8, size: 0.05 },
      // The top of the 2D rail (and the message box under it) is pinned here.
      chips: { position: [0, 0.42, 0.55], rotation: [-0.12, 0, 0], scale: 1, w: 3.4 },
      input: { position: [0, -0.08, 0.8], rotation: [-0.14, 0, 0], scale: 1, w: 2.2 },
      her: [0, 0, 0],
      // Room under the cards for the 2D rail (up to two rows) and the message box.
      frame: { w: 3.0, h: 2.15, center: [0, 0.96, 0] },
    }
  }

  // Place things by screen fraction (fx, fy from the top-left) on a plane `depth` in front of the camera.
  const { position: cp, target: ct } = PORTRAIT.camera
  const pitch = Math.atan2(cp[1] - ct[1], cp[2] - ct[2])
  const fwd = [0, -Math.sin(pitch), -Math.cos(pitch)]
  const up = [0, Math.cos(pitch), -Math.sin(pitch)]
  const D = PORTRAIT.depth
  const viewH = 2 * D * T
  const viewW = viewH * aspect
  const at = (fx: number, fy: number): Vec3 => {
    const ox = (fx - 0.5) * viewW
    const oy = -(fy - 0.5) * viewH
    return [cp[0] + fwd[0] * D + ox, cp[1] + fwd[1] * D + up[1] * oy, cp[2] + fwd[2] * D + up[2] * oy]
  }
  const facing: Vec3 = [-pitch, 0, 0]

  const w = 2.5
  const h = 0.6
  const s = (0.92 * viewW) / w
  const cardH = (h * s) / viewH
  const gap = 0.012
  // Bands, top to bottom: her (to ~0.3), her line, four cards, then the 2D rail
  // (its 2×2 grid; on phones typing lives in its menu, as in 2D).
  const chipsAt = 0.872
  const first = chipsAt - 0.012 - 4 * (cardH + gap)
  return {
    portrait: true,
    card: { w, h, radius: RADIUS },
    pose: (c) => ({ position: at(0.5, first + cardH / 2 + c * (cardH + gap)), rotation: facing, scale: s, right: false, bottom: false }),
    line: { position: at(0.5, first - 0.05), rotation: facing, scale: s, w: 2.5, size: 0.1 },
    // Chips and the input read larger than the cards' type would make them, as the 2D phone rail does.
    chips: { position: at(0.5, chipsAt), rotation: facing, scale: s * 1.9, w: 2.5 / 1.9 },
    input: { position: at(0.5, 0.975), rotation: facing, scale: s * 1.6, w: 2.4 / 1.6 },
    her: PORTRAIT.her,
    frame: { w: 2.7, h: 5.9, center: ct },
    camera: PORTRAIT.camera,
  }
}

export function useStage(): Stage {
  const aspect = useThree((s) => s.size.width / s.size.height)
  const portrait = aspect < 0.8
  const key = portrait ? Math.round(aspect * 40) / 40 : 1.6
  return useMemo(() => stageFor(key), [key])
}

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
  const portrait = aspect < 0.8
  // Phones keep to her head and shoulders above the panel.
  const viewH = portrait ? 1.3 : 1.42
  const viewW = viewH * aspect
  const dist = viewH / 2 / T
  const her = portrait ? PORTRAIT.her : ([0, 0, 0] as Vec3)
  const target: Vec3 = portrait ? [her[0], her[1] + 1.2, her[2]] : [0.26 * viewW, 1.47, 0]
  const rect = portrait ? { x0: 0.03, y0: 0.32, x1: 0.97, y1: 0.985 } : { x0: 0.45, y0: 0.06, x1: 0.95, y1: 0.94 }
  const cx = (rect.x0 + rect.x1) / 2
  const cy = (rect.y0 + rect.y1) / 2
  // On a phone the panel covers her body, so it stands in front of her (nearer the
  // camera, scaled to cover the same part of the screen); wide, it stands beside her.
  const ahead = portrait ? 0.8 : 0
  const k = (dist - ahead) / dist
  return {
    portrait,
    rect,
    target,
    dist,
    view: { w: viewW, h: viewH },
    panel: {
      position: [target[0] + (cx - 0.5) * viewW * k, target[1] - (cy - 0.5) * viewH * k, target[2] + ahead],
      w: (rect.x1 - rect.x0) * viewW * k,
      h: (rect.y1 - rect.y0) * viewH * k,
    },
  }
}
