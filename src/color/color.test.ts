import { describe, expect, it } from 'vitest'
import { contrast, deltaE, ensureContrast, gamutMap, hexToOklch, oklchToHex } from './oklch'
import { buildScheme, ROLES } from './scheme'

const L = (hex: string) => hexToOklch(hex)!

describe('oklch', () => {
  it('round-trips sRGB hex', () => {
    for (const hex of ['#3f3e6f', '#ffbe0b', '#e3425f', '#de2b52', '#2eddba', '#000000', '#ffffff']) {
      expect(oklchToHex(L(hex))).toBe(hex)
    }
  })

  it('maps out-of-gamut colours by chroma only', () => {
    const wild = { l: 0.7, c: 0.4, h: 140 }
    const mapped = gamutMap(wild)
    expect(mapped.l).toBe(0.7)
    expect(mapped.h).toBe(140)
    expect(mapped.c).toBeLessThan(0.4)
  })

  it('finds the closest readable relative', () => {
    const bg = '#f3f3fe'
    const out = ensureContrast('#2eddba', bg, 4.5)
    expect(contrast(out, bg)).toBeGreaterThanOrEqual(4.5)
    expect(Math.abs(L(out).h - L('#2eddba').h)).toBeLessThan(6) // still turquoise
  })
})

describe('scheme guardrails', () => {
  const checkReadable = (s: ReturnType<typeof buildScheme>) => {
    for (const t of ['day', 'dusk'] as const) {
      const a = s[t]
      expect(contrast(a.surface.text, a.surface.bg)).toBeGreaterThanOrEqual(7)
      expect(contrast(a.surface.muted, a.surface.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(a.onAccent, a.role.accent)).toBeGreaterThanOrEqual(3)
      for (const r of ROLES) {
        expect(contrast(a.role[r], a.surface.bg), `${t} role ${r}`).toBeGreaterThanOrEqual(3)
        expect(contrast(a.ink[r], a.surface.bg), `${t} ink ${r}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  }

  it('brand scheme is accessible in both themes', () => {
    const s = buildScheme()
    checkReadable(s)
    expect(s.notes).toEqual([])
  })

  it('keeps any wild request readable', () => {
    for (const input of [
      { seed: '#ffff00' },
      { seed: '#000000', harmony: 'triadic' as const },
      { accent: '#ffffff', neutral: '#ff00ff' },
      { neutral: '#00ff00', task: '#f3f3fe', event: '#010101' },
    ]) {
      checkReadable(buildScheme(input))
    }
  })

  it('keeps surfaces near-neutral whatever the neutral', () => {
    const s = buildScheme({ neutral: '#ff0000' })
    expect(L(s.day.surface.bg).c).toBeLessThanOrEqual(0.015)
    expect(L(s.dusk.surface.bg).c).toBeLessThanOrEqual(0.052)
  })

  it('urgent stays warm and calm never does', () => {
    const s = buildScheme({ urgent: '#2050ff', calm: '#ff4000' })
    const u = L(s.base.urgent).h
    expect(u >= 349 || u <= 71).toBe(true)
    expect(L(s.base.calm).h).toBeGreaterThan(60)
    expect(s.notes.join(' ')).toMatch(/urgent/)
  })

  it('separates colours that must be told apart', () => {
    const s = buildScheme({ task: '#3366ff', event: '#3366ff', reminder: '#3366ff', goal: '#3366ff' })
    const kinds = ['task', 'event', 'reminder', 'goal'] as const
    for (let i = 0; i < kinds.length; i++)
      for (let j = i + 1; j < kinds.length; j++)
        expect(deltaE(L(s.base[kinds[i]]), L(s.base[kinds[j]]))).toBeGreaterThanOrEqual(0.09)
  })

  it('ignores junk and says so', () => {
    const s = buildScheme({ accent: 'banana', ambient: ['#fff'] as string[], orb: 'nope' as unknown as string[] })
    expect(s.base.accent).toBe(buildScheme().base.accent)
    expect(s.notes.join(' ')).toMatch(/accent/)
    expect(s.day.ambient).toBeNull()
    expect(s.orb).toBeNull()
  })

  it('bands ambient colours per theme', () => {
    const s = buildScheme({ ambient: ['#000000', '#ffffff', '#ff0000'] })
    for (const c of s.day.ambient!) expect(L(c).l).toBeGreaterThanOrEqual(0.71)
    for (const c of s.dusk.ambient!) expect(L(c).l).toBeLessThanOrEqual(0.69)
  })
})

describe('mood colours', () => {
  const toHex = (c: [number, number, number]) =>
    '#' +
    c
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')

  it('anger reads warm, sadness cool, in the brand palette', async () => {
    const { orbColors } = await import('../ui/palette')
    const brand = buildScheme()
    const anger = L(toHex(orbColors(null, { anger: 0.9 }, brand)[0])).h
    const sad = L(toHex(orbColors(null, { sadness: 0.9 }, brand)[0])).h
    expect(anger < 60 || anger > 340).toBe(true)
    expect(sad).toBeGreaterThan(200)
    expect(sad).toBeLessThan(320)
  })

  it("follows Wendy's palette", async () => {
    const { orbColors } = await import('../ui/palette')
    const brand = orbColors(null, { trust: 0.9 }, buildScheme())
    const violet = orbColors(null, { trust: 0.9 }, buildScheme({ seed: '#7A5AD6' }))
    expect(toHex(violet[0])).not.toBe(toHex(brand[0]))
    expect(L(toHex(violet[0])).h).toBeGreaterThan(260)
  })

  it('glows brighter for stronger feelings', async () => {
    const { moodIntensity } = await import('../ui/palette')
    expect(moodIntensity(null, {})).toBe(0)
    expect(moodIntensity(null, { joy: 0.1 })).toBeLessThan(moodIntensity(null, { joy: 0.8 }))
    expect(moodIntensity({ emotion: 'joy', intensity: 'high' } as never, {})).toBe(1)
  })
})
