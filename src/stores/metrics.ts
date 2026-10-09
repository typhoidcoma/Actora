import { create } from 'zustand'

/**
 * Stage geometry in px. One source of truth for the line, grid, orb notches, rail,
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
  /** Grid centre: where the orb rests. */
  cx: number
  cy: number
  compact: boolean
  short: boolean
  /** Wendy's line, between the header and the grid. */
  line: { x: number; y: number; w: number; h: number }
  /** Option rail, docked to the bottom edge. */
  rail: { x: number; y: number; w: number; h: number; padBottom: number }
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
  const compact = vw < 640
  const reserveX = Math.max(safe.left, safe.right) + 16

  // Vertical stack: header · Wendy's line · grid · option rail.
  // No top bar: Wendy's line starts just under the safe area.
  const headerH = safe.top + (short ? 10 : 18)
  const baseLineH = Math.round(short ? 46 : clamp(vh * 0.1, 72, 116))
  // Room for two rows of option chips.
  const railH = Math.max(safe.bottom, 10) + 112
  const availW = vw - reserveX * 2
  const availH = vh - headerH - baseLineH - railH - 12

  // Every card is exactly 4:3, so the grid is two 4:3 cells across and down.
  const gap = Math.round(clamp(Math.min(availW, availH) * 0.018, 8, 16))
  const cellW = Math.floor(clamp(Math.min((availW - gap) / 2, ((availH - gap) / 2) * (4 / 3)), 140, 600))
  const cellH = Math.round(cellW * 0.75)
  const gridW = cellW * 2 + gap
  const gridH = cellH * 2 + gap
  const grid = Math.min(gridW, gridH)
  // Small cells (phones) get a smaller orb so it never covers card text.
  const orb = Math.round(grid * (cellW < 260 ? 0.25 : 0.32))
  const radius = Math.round(clamp(grid * 0.012, 6, 9))
  const gridX = Math.round((vw - gridW) / 2)
  // Spare height: phones give some to Wendy's line (their cards are small);
  // then the line + grid block is centred, so space splits evenly above and below.
  const spare = Math.max(0, availH - gridH)
  const lineGrow = compact ? Math.round(Math.min(spare * 0.5, 140)) : 0
  const lineH = baseLineH + lineGrow
  const stackTop = Math.round(headerH + (spare - lineGrow) / 2)
  const gridY = stackTop + lineH + 6

  const lineW = Math.round(Math.min(vw - reserveX * 2, Math.max(gridW, 720)))
  // Her line owns the whole band above the cards; text is centred in it.
  const line = { x: Math.round((vw - lineW) / 2), y: safe.top, w: lineW, h: Math.max(lineH, gridY - safe.top) }
  const railW = Math.round(Math.min(vw - 16, 960))
  const rail = {
    x: Math.round((vw - railW) / 2),
    y: vh - railH,
    w: railW,
    h: railH,
    padBottom: Math.max(safe.bottom, 10),
  }

  const sheetW = compact ? vw : Math.min(700, vw - 48)
  const sheetH = compact ? Math.round(vh * 0.9) : Math.min(vh - 80, 840)
  const sheet = {
    w: sheetW,
    h: sheetH,
    x: Math.round((vw - sheetW) / 2),
    y: compact ? vh - sheetH : Math.round((vh - sheetH) / 2),
    radius: 10,
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
    gridX,
    gridY,
    cx: gridX + gridW / 2,
    cy: gridY + gridH / 2,
    compact,
    short,
    line,
    rail,
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
