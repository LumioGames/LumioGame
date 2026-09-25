import { describe, expect, it } from 'vitest'
import { BlockType, 方向 } from '../../contract'
import { auraCells, blinkScan, kickOutcome, slideStop, type GridProbe } from '../skill-geometry'

/** D12 闪现落点 / D13 光环范围 / 踢弹滑行（纯几何）。 */
const N = 9
function grid(): GridProbe & { brick: Uint8Array; ground: Uint8Array; occ: Set<number> } {
  const brick = new Uint8Array(N * N)
  const ground = new Uint8Array(N * N).fill(BlockType.地面)
  const occ = new Set<number>()
  return { size: N, brick, ground, occ, occupied: (ci) => occ.has(ci) }
}
const at = (x: number, y: number) => y * N + x

describe('blinkScan', () => {
  it('passes over a brick, a bomb and a chest and lands on the farthest free cell', () => {
    const g = grid()
    g.brick[at(2, 4)] = BlockType.积木
    g.occ.add(at(3, 4)) // 炸弹或宝箱
    const r = blinkScan(g, at(1, 4), 方向.右, 3)
    expect(r?.landing).toBe(at(4, 4))
    // 火墙 = 起点 + 途经的空砖格，不含落点（RESOLUTIONS #6）。
    expect(r?.path).toEqual([at(1, 4), at(3, 4)])
  })

  it('lands short when the farthest scanned cell is blocked', () => {
    const g = grid()
    g.brick[at(4, 4)] = BlockType.木箱
    const r = blinkScan(g, at(1, 4), 方向.右, 3)
    expect(r?.landing).toBe(at(3, 4))
    expect(r?.path).toEqual([at(1, 4), at(2, 4)])
  })

  it('iron truncates the scan: cells beyond are unreachable', () => {
    const g = grid()
    g.brick[at(2, 4)] = BlockType.积木
    g.brick[at(3, 4)] = BlockType.铁皮
    expect(blinkScan(g, at(1, 4), 方向.右, 3)).toBeNull()
    g.brick[at(2, 4)] = BlockType.Air
    expect(blinkScan(g, at(1, 4), 方向.右, 3)).toEqual({ landing: at(2, 4), path: [at(1, 4)] })
  })

  it('board edge and facing 停', () => {
    const g = grid()
    expect(blinkScan(g, at(8, 4), 方向.右, 3)).toBeNull()
    expect(blinkScan(g, at(7, 4), 方向.右, 3)?.landing).toBe(at(8, 4))
    expect(blinkScan(g, at(4, 4), 方向.停, 3)).toBeNull()
    expect(blinkScan(g, at(4, 1), 方向.上, 3)?.landing).toBe(at(4, 0))
  })

  it('no free cell in range → null', () => {
    const g = grid()
    for (const x of [5, 6, 7]) g.brick[at(x, 4)] = BlockType.积木
    expect(blinkScan(g, at(4, 4), 方向.右, 3)).toBeNull()
  })
})

describe('auraCells', () => {
  it('3×3 including the centre in the interior, Y then X', () => {
    const g = grid()
    expect(auraCells(g, at(4, 4))).toEqual([at(3, 3), at(4, 3), at(5, 3), at(3, 4), at(4, 4), at(5, 4), at(3, 5), at(4, 5), at(5, 5)])
  })

  it('clipped at the board edge; iron and bricks removed', () => {
    const g = grid()
    expect(auraCells(g, at(0, 0))).toEqual([at(0, 0), at(1, 0), at(0, 1), at(1, 1)])
    g.brick[at(5, 4)] = BlockType.铁皮
    g.brick[at(3, 3)] = BlockType.积木
    expect(auraCells(g, at(4, 4))).toHaveLength(7)
  })
})

describe('slideStop / kickOutcome', () => {
  it('stops before bricks, bombs and chests, and at the range limit; players do not block', () => {
    const g = grid()
    expect(slideStop(g, at(1, 4), 方向.右, 3)).toBe(at(4, 4))
    expect(slideStop(g, at(1, 4), 方向.右, 99)).toBe(at(8, 4))
    g.brick[at(4, 4)] = BlockType.积木
    expect(slideStop(g, at(1, 4), 方向.右, 99)).toBe(at(3, 4))
    g.occ.add(at(3, 4))
    expect(slideStop(g, at(1, 4), 方向.右, 99)).toBe(at(2, 4))
    g.occ.add(at(2, 4))
    expect(slideStop(g, at(1, 4), 方向.右, 99)).toBe(at(1, 4))
  })

  it('kickOutcome: the first water cell entered ends the slide and extinguishes', () => {
    const g = grid()
    g.ground[at(3, 4)] = BlockType.水
    expect(kickOutcome(g, at(1, 4), 方向.右, 5)).toEqual({ stop: at(3, 4), cells: 2, water: true })
    g.ground[at(2, 4)] = BlockType.水
    expect(kickOutcome(g, at(1, 4), 方向.右, 5)).toEqual({ stop: at(2, 4), cells: 1, water: true })
    expect(kickOutcome(g, at(1, 4), 方向.左, 5)).toEqual({ stop: at(0, 4), cells: 1, water: false })
    g.brick[at(2, 4)] = BlockType.积木
    expect(kickOutcome(g, at(1, 4), 方向.右, 5)).toEqual({ stop: at(1, 4), cells: 0, water: false })
  })
})
