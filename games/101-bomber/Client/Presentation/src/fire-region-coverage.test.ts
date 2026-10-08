import { describe, expect, it } from 'vitest'
import { decodeFireRegionCells } from './fire-region-coverage'

describe('formal favorite region mask', () => {
  it('keeps empty regions empty and decodes row-major bits', () => {
    expect(decodeFireRegionCells(5, 5, 0)).toEqual([])
    expect(decodeFireRegionCells(5, 5, 1)).toEqual([{ X: 4, Y: 4 }])
    expect(decodeFireRegionCells(5, 5, 16)).toEqual([{ X: 5, Y: 5 }])
    expect(decodeFireRegionCells(5, 5, 256)).toEqual([{ X: 6, Y: 6 }])
    expect(decodeFireRegionCells(5, 5, 511)).toHaveLength(9)
  })
  it.each([undefined, -1, 512, 1.5, NaN])('rejects an invalid mask %s', mask => {
    expect(() => decodeFireRegionCells(5, 5, mask)).toThrow('fire_region_mask_invalid')
  })
})
