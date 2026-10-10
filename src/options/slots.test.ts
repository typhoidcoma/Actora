import { describe, expect, it } from 'vitest'
import { placeInSlots } from './slots'
import { sayOption } from './types'

const o = (l: string) => sayOption(l)
const labels = (s: ReturnType<typeof placeInSlots>) => s.map((x) => x?.label ?? null)

describe('phone tile slots', () => {
  it('fills in order, leaving the rest empty', () => {
    expect(labels(placeInSlots([], [o('A'), o('B')], 4))).toEqual(['A', 'B', null, null])
  })

  it('an option that survives keeps its tile; new ones take the free tiles', () => {
    const first = placeInSlots([], [o('Which first'), o('Add one')], 4)
    const next = placeInSlots(first, [o('Quick wins'), o('Batch errands'), o('Which first'), o('Add one')], 4)
    expect(labels(next)).toEqual(['Which first', 'Add one', 'Quick wins', 'Batch errands'])
  })

  it('drops what is gone and only shows the top n', () => {
    const first = placeInSlots([], [o('A'), o('B'), o('C'), o('D')], 4)
    expect(labels(placeInSlots(first, [o('E'), o('C'), o('F'), o('G'), o('H')], 4))).toEqual(['E', 'F', 'C', 'G'])
  })
})
