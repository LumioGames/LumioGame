import { describe, expect, it } from 'vitest'
import { BlockType } from '../contract'
import { ReplicaTerrain } from '../replica-terrain'
import { barrelGeometry } from '../view/geo/blocks'

describe('real barrel terrain projection', () => {
  it('projects the new native barrel separately from the historical firecracker', () => {
    const terrain = new ReplicaTerrain(2, 0, 1, [
      { blockType: 1022, name: 'floor' },
      { blockType: 1030, name: 'firecracker' },
      { blockType: 1032, name: 'barrel' },
    ])
    const surface = terrain.read({ readSurface: ({ minY }) => ({
      width: 2, depth: 2,
      states: Uint8Array.from(minY === 0 ? [2, 2, 2, 2] : [2, 2, 1, 1]),
      blockIds: Uint32Array.from(minY === 0 ? [1022 << 8, 1022 << 8, 1022 << 8, 1022 << 8]
        : [1032 << 8, 1030 << 8, 0, 0]),
    }) })
    expect(surface).not.toBeNull()
    expect(surface!.brick[0]).toBe(BlockType.桶)
    expect(surface!.brick[0]).not.toBe(BlockType.鞭炮)
    expect(surface!.brick[1]).toBe(BlockType.鞭炮)
    expect(surface!.brick[2]).toBe(BlockType.Air)
  })
  it('keeps its round silhouette and warning details inside one playable cell', () => {
    const geometry = barrelGeometry()
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox!
    expect(bounds.min.y).toBeGreaterThanOrEqual(0)
    expect(bounds.max.y).toBeLessThan(1)
    expect(bounds.max.y).toBeGreaterThan(0.85)
    expect(bounds.max.x - bounds.min.x).toBeLessThan(0.9)
    expect(bounds.max.z - bounds.min.z).toBeLessThan(0.9)
    const position = geometry.getAttribute('position')
    expect(position.count).toBeLessThan(2500)
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true)
    expect(geometry.getAttribute('color').count).toBe(position.count)
    geometry.dispose()
  })
})
