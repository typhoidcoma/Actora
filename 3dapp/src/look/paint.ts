import { FONT } from './fonts'

/** Canvas pixels per world unit. */
export const PPU = 520

export const px = (u: number) => Math.round(u * PPU)

export const font = (weight: number, size: number) => `${weight} ${px(size)}px ${FONT}`

const scratch = document.createElement('canvas').getContext('2d')!

/** Word-wraps `text` to `max` pixels in `fontSpec`; clamps to `cap` lines with an ellipsis. */
export function wrap(text: string, fontSpec: string, max: number, cap = Infinity, spacing = '0px'): string[] {
  scratch.font = fontSpec
  scratch.letterSpacing = spacing
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (scratch.measureText(next).width > max && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  if (lines.length > cap) {
    const kept = lines.slice(0, cap)
    let last = kept[cap - 1]
    while (last && scratch.measureText(`${last}…`).width > max) last = last.replace(/\s*\S*$/, '')
    kept[cap - 1] = `${last}…`
    return kept
  }
  return lines
}

export function textWidth(text: string, fontSpec: string, spacing = '0px'): number {
  scratch.font = fontSpec
  scratch.letterSpacing = spacing
  return scratch.measureText(text).width
}

/** Draws lines top-down from y; returns the y after the last line. */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  fontSpec: string,
  color: string,
  align: CanvasTextAlign = 'left',
  spacing = '0px',
): number {
  ctx.font = fontSpec
  ctx.letterSpacing = spacing
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  for (const line of lines) {
    ctx.fillText(line, x, y + lineHeight * 0.8)
    y += lineHeight
  }
  return y
}

/** CSS colour with its alpha replaced (hex or rgb()). */
export function withAlpha(css: string, a: number): string {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(css)
  if (m) return `rgb(${m[1]} ${m[2]} ${m[3]} / ${a})`
  const hex = css.replace('#', '')
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex.slice(0, 6), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`
}
