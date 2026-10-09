import { describe, expect, it } from 'vitest'
import { randomLayout } from './palette'
import { classify } from './sky'

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
