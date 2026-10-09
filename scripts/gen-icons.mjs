// Renders the app icon (daylily/smoke/midnight orb on Hog Bristle) to PNGs for the PWA manifest
// and iOS home screen. Zero dependencies: rasterises with math, encodes with zlib.
// Usage: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const CREAM = hex('#E5DDCB')
const STOPS = [
  [0, hex('#F4EEE2')],
  [0.3, hex('#EB7B59')],
  [0.7, hex('#A7C5BD')],
  [1, hex('#524656')],
]
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
function ramp(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    const [t0, c0] = STOPS[i - 1]
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0))
  }
  return STOPS.at(-1)[1]
}

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  const R = size * 0.3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const r = Math.hypot(dx, dy)
      // light from upper-left
      const lr = Math.hypot(dx + R * 0.35, dy + R * 0.4) / (R * 1.45)
      const body = Math.min(1, Math.max(0, R - r + 0.5))
      // soft warm halo instead of a neon glow
      const glow = Math.exp(-Math.max(0, r - R) / (size * 0.07)) * 0.35 * (1 - body)
      let col = mix(CREAM, ramp(Math.min(1, lr)), body)
      col = mix(col, hex('#EB7B59'), glow)
      const i = (y * size + x) * 4
      px[i] = col[0]
      px[i + 1] = col[1]
      px[i + 2] = col[2]
      px[i + 3] = 255
    }
  }
  return png(size, px)
}

/** Monochrome notification badge: white disc on transparent (Android masks by alpha). */
function badge(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  const R = size * 0.34
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.min(1, Math.max(0, R - Math.hypot(x + 0.5 - c, y + 0.5 - c) + 0.5))
      px.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4)
    }
  }
  return png(size, px)
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['apple-touch-icon', 180],
]) {
  writeFileSync(`public/icons/${name}.png`, render(size))
  console.log(`public/icons/${name}.png`)
}
writeFileSync('public/icons/badge-72.png', badge(72))
console.log('public/icons/badge-72.png')
