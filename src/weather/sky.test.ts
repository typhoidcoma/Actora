import { describe, expect, it } from 'vitest'
import { randomLayout } from './palette'
import { classify, isDaylight, type Sky } from './sky'

describe('weather', () => {
  it('maps WMO codes to skies', () => {
    expect(classify(0)).toBe('clear')
    expect(classify(2)).toBe('partly')
    expect(classify(3)).toBe('cloudy')
    expect(classify(45)).toBe('fog')
    expect(classify(61)).toBe('rain')
    expect(classify(81)).toBe('rain')
    expect(classify(73)).toBe('snow')
    expect(classify(86)).toBe('snow')
    expect(classify(95)).toBe('storm')
  })

  it('randomises layout but uses every colour slot once', () => {
    const a = randomLayout()
    expect(a.map((b) => b.slot).sort()).toEqual([0, 1, 2, 3])
    expect(a.every((b) => b.size >= 42 && b.size <= 70)).toBe(true)
  })
})

const sky = (sunrise: string, sunset: string): Sky => ({
  kind: 'clear',
  isDay: false,
  temp: null,
  unit: 'F',
  source: 'live',
  sunrise,
  sunset,
})

describe('follows the sun', () => {
  it('is day between sunrise and sunset', () => {
    const s = sky('2026-10-09T07:12', '2026-10-09T18:31')
    expect(isDaylight(s, new Date(2026, 9, 9, 7, 0))).toBe(false)
    expect(isDaylight(s, new Date(2026, 9, 9, 12, 0))).toBe(true)
    expect(isDaylight(s, new Date(2026, 9, 9, 18, 40))).toBe(false)
  })

  it("still right the next day on yesterday's reading (no fresh forecast yet)", () => {
    const s = sky('2026-10-08T07:11', '2026-10-08T18:33')
    expect(isDaylight(s, new Date(2026, 9, 9, 10, 30))).toBe(true)
    expect(isDaylight(s, new Date(2026, 9, 9, 21, 0))).toBe(false)
  })
})
