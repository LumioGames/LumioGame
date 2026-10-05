import type { BomberCell } from './contract'

/** Game 3x3 bit order shared with BomberFireRegionCoverage: z first, then x. */
export function decodeFireRegionCells(x: number, z: number, mask: number | undefined): BomberCell[] {
  if (!Number.isSafeInteger(mask) || mask! < 0 || mask! > 511) throw new Error('fire_region_mask_invalid')
  const cells: BomberCell[] = []
  for (let bit = 0; bit < 9; bit++)
    if ((mask! & (1 << bit)) !== 0) cells.push({ X: x + bit % 3 - 1, Y: z + Math.floor(bit / 3) - 1 })
  return cells
}
