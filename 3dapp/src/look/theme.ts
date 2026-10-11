import { useShallow } from 'zustand/react/shallow'
import * as THREE from 'three/webgpu'
import type { Role } from '@actora/color/scheme'
import { useScheme } from '@actora/stores/scheme'
import { useTheme } from '@actora/ui/Theme'
import { blobColor } from '@actora/weather/palette'
import { useSky } from '@actora/weather/sky'

/** One CSS colour from the scheme (hex or `rgb(r g b / a)`) as a three colour plus alpha. */
export function parseCss(css: string, out = new THREE.Color()): { color: THREE.Color; alpha: number } {
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)/.exec(css)
  if (rgb) {
    out.setRGB(+rgb[1] / 255, +rgb[2] / 255, +rgb[3] / 255, THREE.SRGBColorSpace)
    const a = rgb[4] ?? '1'
    return { color: out, alpha: a.endsWith('%') ? parseFloat(a) / 100 : +a }
  }
  out.setStyle(css, THREE.SRGBColorSpace)
  return { color: out, alpha: 1 }
}

export interface Look {
  day: boolean
  bg: string
  bg2: string
  strong: string
  text: string
  muted: string
  line: string
  glass: string
  glassThick: string
  role: Record<Role, string>
  ink: Record<Role, string>
  /** The weather's four ambient colours (the 2D blobs), as CSS. */
  sky: string[]
}

/**
 * The 2D app's live look, in one place for the scene: the theme (day/dusk from the
 * sun or the user's choice), the scheme (brand, or the agent's colors.set) and the
 * weather. Everything here cross-fades in 2D, so the scene eases between values too.
 */
export function useLook(): Look {
  const day = useTheme() === 'day'
  const sky = useSky()
  const applied = useScheme(useShallow((s) => s.scheme[day ? 'day' : 'dusk']))
  const s = applied.surface
  return {
    day,
    bg: s.bg,
    bg2: s.bg2,
    strong: s.strong,
    text: s.text,
    muted: s.muted,
    line: s.line,
    glass: s.glass,
    glassThick: s.glassThick,
    role: applied.role,
    ink: applied.ink,
    sky: [0, 1, 2, 3].map((slot) => blobColor(sky, slot, day, applied.ambient)),
  }
}
