import { describe, expect, it } from 'vitest'
import { BlockType, 方向 } from '../../contract'
import { auraCells, blinkScan, flyKickTarget, kickOutcome, slideStop, type GridProbe } from '../skill-geometry'

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

describe('flyKickTarget (飞腿袋鼠 飞踢，用户 2026-09-28)', () => {
  /** 静止炸弹 = occ 里、且不在 sliding 里的格。 */
  function withBombs(...cells: number[]) {
    const g = grid()
    const statics = new Set(cells)
    for (const c of cells) g.occ.add(c)
    return { g, isStatic: (ci: number) => statics.has(ci), statics }
  }

  it('adjacent static bomb → kicked, slides until blocked (range 99)', () => {
    const { g, isStatic } = withBombs(at(3, 4))
    expect(flyKickTarget(g, at(2, 4), 方向.右, 99, isStatic)).toEqual({ bomb: at(3, 4), stop: at(8, 4), cells: 5, water: false })
  })

  it('open ground in front, static bomb one cell further → that bomb; a candy / player on the gap is not occupancy', () => {
    const { g, isStatic } = withBombs(at(4, 4))
    expect(flyKickTarget(g, at(2, 4), 方向.右, 99, isStatic)).toMatchObject({ bomb: at(4, 4), stop: at(8, 4), cells: 4 })
    // 空地可以是水。
    g.ground[at(3, 4)] = BlockType.水
    expect(flyKickTarget(g, at(2, 4), 方向.右, 99, isStatic)?.bomb).toBe(at(4, 4))
  })

  it('the gap must be open: a brick / chest / moving bomb in front blocks the look-through', () => {
    for (const block of ['brick', 'chest', 'moving'] as const) {
      const { g, isStatic } = withBombs(at(4, 4))
      if (block === 'brick') g.brick[at(3, 4)] = BlockType.积木
      else g.occ.add(at(3, 4)) // 宝箱，或一颗正在滑行的弹（占格但不静止）
      expect(flyKickTarget(g, at(2, 4), 方向.右, 99, isStatic), block).toBeNull()
    }
  })

  it('a moving bomb is never a target; two cells away is too far; the border / 停 → null', () => {
    const g = grid()
    g.occ.add(at(3, 4))
    expect(flyKickTarget(g, at(2, 4), 方向.右, 99, () => false)).toBeNull()
    const far = withBombs(at(5, 4))
    expect(flyKickTarget(far.g, at(2, 4), 方向.右, 99, far.isStatic)).toBeNull()
    const edge = withBombs(at(0, 4))
    expect(flyKickTarget(edge.g, at(0, 4), 方向.左, 99, edge.isStatic)).toBeNull()
    expect(flyKickTarget(edge.g, at(1, 4), 方向.停, 99, edge.isStatic)).toBeNull()
  })

  it('a bomb that cannot move one cell counts as nothing to kick; water behind = extinguished at the first water cell', () => {
    const { g, isStatic } = withBombs(at(3, 4), at(4, 4))
    // 相邻那颗被后面那颗顶住；不会越过它去踢后面那颗。
    expect(flyKickTarget(g, at(2, 4), 方向.右, 99, isStatic)).toBeNull()
    const w = withBombs(at(3, 4))
    w.g.ground[at(6, 4)] = BlockType.水
    expect(flyKickTarget(w.g, at(2, 4), 方向.右, 99, w.isStatic)).toEqual({ bomb: at(3, 4), stop: at(6, 4), cells: 3, water: true })
  })
})
