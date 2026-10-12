import { create } from 'zustand'
import * as THREE from 'three/webgpu'
import type { Role } from '@actora/color/scheme'
import { useScheme } from '@actora/stores/scheme'
import { useUi } from '@actora/stores/ui'
import { blobColor } from '@actora/weather/palette'
import { isDaylight, useSky } from '@actora/weather/sky'

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

function compute(): Look {
  const mode = useUi.getState().theme
  const sky = useSky.getState()
  const day = mode === 'auto' ? isDaylight(sky) : mode === 'day'
  const applied = useScheme.getState().scheme[day ? 'day' : 'dusk']
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

/** True when two looks would paint the same (so a recompute doesn't re-render anyone). */
function same(a: Look, b: Look): boolean {
  return (
    a.day === b.day &&
    a.bg === b.bg &&
    a.bg2 === b.bg2 &&
    a.strong === b.strong &&
    a.text === b.text &&
    a.muted === b.muted &&
    a.line === b.line &&
    a.glass === b.glass &&
    a.glassThick === b.glassThick &&
    a.role === b.role &&
    a.ink === b.ink &&
    a.sky.join() === b.sky.join()
  )
}

/**
 * The look, computed once for everyone: from the theme choice, the weather and the
 * scheme, rechecked each minute (the sun crossing sunrise or sunset). One store and
 * one timer, instead of one per panel.
 */
const useLookStore = create<{ look: Look }>(() => ({ look: compute() }))
let started = false
function start(): void {
  if (started) return
  started = true
  const refresh = () => {
    const next = compute()
    if (!same(next, useLookStore.getState().look)) useLookStore.setState({ look: next })
  }
  useUi.subscribe((s, p) => s.theme !== p.theme && refresh())
  useSky.subscribe(refresh)
  useScheme.subscribe(refresh)
  setInterval(refresh, 60_000)
}

/**
 * The 2D app's live look, in one place for the scene: the theme (day/dusk from the
 * sun or the user's choice), the scheme (brand, or the agent's colors.set) and the
 * weather. Everything here cross-fades in 2D, so the scene eases between values too.
 */
/** The current look, outside React (per-frame code). */
export function lookNow(): Look {
  start()
  return useLookStore.getState().look
}

export function useLook(): Look {
  start()
  return useLookStore((s) => s.look)
}
