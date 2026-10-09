import { create } from 'zustand'

/**
 * Stage geometry in px. One source of truth for the grid, the orb notches,
 * the orb's dock positions and the chat sheet, so every animation can be
 * expressed as transforms between known boxes. Mirrored into CSS variables.
 */
export interface Metrics {
  vw: number
  vh: number
  /** Shorter grid side; drives orb and type scale. */
  grid: number
  gridW: number
  gridH: number
  gap: number
  orb: number
  radius: number
  gridX: number
  gridY: number
  compact: boolean
  sheet: { x: number; y: number; w: number; h: number; radius: number }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function safeInsets() {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const out = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  }
  probe.remove()
  return out
}

export function measure(): Metrics {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const safe = safeInsets()
  const short = vh < 520
  const reserveY = Math.max(safe.top + (short ? 44 : 72), safe.bottom + 28)
  const reserveX = Math.max(safe.left, safe.right) + 16
  const availW = vw - reserveX * 2
  const availH = vh - reserveY * 2
  const side = Math.floor(clamp(Math.min(availW, availH), 220, 900))
  // Square tiles on tablets and desktops; on phones, stretch along the long axis
  // so the tiles use the screen instead of floating in it.
  const phone = Math.min(vw, vh) < 600
  const gridW = phone && availW > availH ? Math.floor(Math.min(availW, side * 1.6)) : side
  const gridH = phone && availH > availW ? Math.floor(Math.min(availH, side * 1.45)) : side
  const grid = Math.min(gridW, gridH)
  const gap = Math.round(clamp(grid * 0.018, 8, 16))
  const orb = Math.round(grid * 0.3)
  const radius = Math.round(clamp(grid * 0.045, 18, 34))
  const compact = vw < 640

  const sheetW = compact ? vw : Math.min(700, vw - 48)
  const sheetH = compact ? Math.round(vh * 0.9) : Math.min(vh - 80, 840)
  const sheet = {
    w: sheetW,
    h: sheetH,
    x: Math.round((vw - sheetW) / 2),
    y: compact ? vh - sheetH : Math.round((vh - sheetH) / 2),
    radius: compact ? 28 : 32,
  }

  return {
    vw,
    vh,
    grid,
    gridW,
    gridH,
    gap,
    orb,
    radius,
    gridX: Math.round((vw - gridW) / 2),
    gridY: Math.round((vh - gridH) / 2),
    compact,
    sheet,
  }
}

export const useMetrics = create<Metrics>(() => measure())

function writeCssVars(m: Metrics) {
  const s = document.documentElement.style
  s.setProperty('--grid', `${m.grid}px`)
  s.setProperty('--gap', `${m.gap}px`)
  s.setProperty('--orb', `${m.orb}px`)
  s.setProperty('--notch', `${m.orb / 2 + m.gap}px`)
  s.setProperty('--radius', `${m.radius}px`)
}

export function watchMetrics(): () => void {
  let raf = 0
  const update = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      const m = measure()
      writeCssVars(m)
      useMetrics.setState(m)
    })
  }
  writeCssVars(useMetrics.getState())
  update()
  window.addEventListener('resize', update)
  window.visualViewport?.addEventListener('resize', update)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('resize', update)
  }
}
