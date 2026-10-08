import { describe, expect, it } from 'vitest'
import { HatFlyFx, type DropTarget } from '../fx/hat-fly'
import {
  diffHatCounts,
  dropOnHeight,
  HAT_DROP_HEIGHT,
  HAT_DROP_MS,
  HAT_LOSS_LAND_Y,
  HAT_LOSS_MS,
  hatLossTargets,
  lossArc,
  towerCount,
  type HatFlow,
} from '../logic/hat-flow'
import { dropLanding, hatLevelOffset, hatLevelScale, HAT_STACK, lossScale } from '../logic/hat-layout'
import type { HatRenderer } from '../world/hat-stack'

describe('diffHatCounts (hats = power-ups, ADR 0028)', () => {
  it('records first sight silently, then reports gains while alive and losses after death', () => {
    const last = new Map<number, number>()
    expect(diffHatCounts(last, [{ id: 1, hats: 2, alive: true }, { id: 2, hats: 5, alive: true }])).toEqual([])
    const out: HatFlow[] = []
    diffHatCounts(last, [{ id: 1, hats: 3, alive: true }, { id: 2, hats: 2, alive: false }], out)
    expect(out).toEqual([
      { id: 1, kind: 'gain', count: 1 },
      { id: 2, kind: 'loss', count: 3 },
    ])
    // 没变化：空
    expect(diffHatCounts(last, [{ id: 1, hats: 3, alive: true }, { id: 2, hats: 2, alive: false }], out)).toEqual([])
  })

  it('a live player losing hats only shrinks (no flying hats); a dead one gaining is also just a resize', () => {
    const last = new Map([[1, 4], [2, 1]])
    expect(diffHatCounts(last, [{ id: 1, hats: 3, alive: true }, { id: 2, hats: 2, alive: false }])).toEqual([
      { id: 1, kind: 'shrink', count: 1 },
      { id: 2, kind: 'shrink', count: 1 },
    ])
  })

  it('forgets players that left the snapshot, so a rejoin is silent again', () => {
    const last = new Map([[1, 4], [9, 7]])
    diffHatCounts(last, [{ id: 1, hats: 4, alive: true }])
    expect(last.has(9)).toBe(false)
    expect(diffHatCounts(last, [{ id: 1, hats: 4, alive: true }, { id: 9, hats: 0, alive: true }])).toEqual([])
  })
})

describe('tower count while hats are in flight', () => {
  it('holds back inbound drops and keeps not-yet-launched lost hats on the tower', () => {
    expect(towerCount(5, 1, 0)).toBe(4)
    expect(towerCount(2, 0, 3)).toBe(5)
    expect(towerCount(0, 2, 0)).toBe(0)
  })
})

describe('hatLossTargets', () => {
  it('uses the reported drop cells first (deduped by cell, snapped to centres)', () => {
    const t = hatLossTargets(2, [{ x: 3.5, z: 4.5 }, { x: 3.2, z: 4.9 }, { x: 5.5, z: 4.5 }], 4.5, 4.5, 7)
    expect(t).toEqual([
      { x: 3.5, z: 4.5 },
      { x: 5.5, z: 4.5 },
    ])
  })

  it('fills the rest deterministically near the death cell (never the death cell itself), clamped to the board', () => {
    const a = hatLossTargets(5, [{ x: 3.5, z: 4.5 }], 0.5, 0.5, 42, 9)
    const b = hatLossTargets(5, [{ x: 3.5, z: 4.5 }], 0.5, 0.5, 42, 9)
    expect(a).toEqual(b)
    expect(a).toHaveLength(5)
    expect(a[0]).toEqual({ x: 3.5, z: 4.5 })
    for (const c of a.slice(1)) {
      expect(c.x).toBeGreaterThanOrEqual(0.5)
      expect(c.z).toBeGreaterThanOrEqual(0.5)
      expect(c.x).toBeLessThanOrEqual(8.5)
      expect(Math.abs(c.x - 0.5) + Math.abs(c.z - 0.5)).toBeLessThanOrEqual(5)
      expect(c.x % 1).toBe(0.5)
    }
    const free = hatLossTargets(8, [], 10.5, 10.5, 3)
    for (const c of free) expect(c.x === 10.5 && c.z === 10.5).toBe(false)
  })
})

describe('flight poses', () => {
  it('drop-on falls from 1.2 cells above and lands exactly on the tower top', () => {
    expect(dropOnHeight(0)).toBeCloseTo(HAT_DROP_HEIGHT)
    expect(dropOnHeight(1)).toBe(0)
    expect(dropOnHeight(0.5)).toBeGreaterThan(dropOnHeight(0.8))
    expect(HAT_DROP_MS).toBe(300)
    // 空塔落在头顶；n 顶的塔落到第 min(n, 4) 层（满 4 顶时是虚拟第 4 层）
    expect(dropLanding(0).offset).toBe(0)
    for (const n of [1, 3]) expect(dropLanding(n).offset).toBeCloseTo(hatLevelOffset(n))
    for (const n of [4, 7]) expect(dropLanding(n).offset).toBeCloseTo(hatLevelOffset(HAT_STACK.cap))
  })

  it('loss arc starts at the tower top, rises, and lands at candy height on the target cell', () => {
    const o = { x: 0, y: 0, z: 0 }
    expect(lossArc(0, 1, 2, 3, 5, 7, o)).toEqual({ x: 1, y: 2, z: 3 })
    const mid = { ...lossArc(0.5, 1, 2, 3, 5, 7, o) }
    expect(mid.y).toBeGreaterThan(2)
    const end = lossArc(1, 1, 2, 3, 5, 7, o)
    expect([end.x, end.z]).toEqual([5, 7])
    expect(end.y).toBeCloseTo(HAT_LOSS_LAND_Y)
  })
})

describe('HatFlyFx', () => {
  const fakeHats = (): HatRenderer & { drawn: number; scales: number[] } => {
    const h = {
      drawn: 0,
      scales: [] as number[],
      hat: (_x: number, _y: number, _z: number, _rx: number, _ry: number, _rz: number, s: number) => {
        h.drawn++
        h.scales.push(s)
      },
    }
    return h as unknown as HatRenderer & { drawn: number; scales: number[] }
  }
  const at: DropTarget = { x: 1, y: 2, z: 3, s: hatLevelScale(2) }
  const resolveOk = (_id: number, out: DropTarget): boolean => {
    out.x = at.x
    out.y = at.y
    out.z = at.z
    out.s = at.s
    return true
  }

  it('drop-on: counts as inbound until it lands, then calls back once with the target', () => {
    const fx = new HatFlyFx()
    const hats = fakeHats()
    const landed: number[] = []
    fx.dropOn(7, 100, 3)
    fx.dropOn(7, 190, 3)
    expect(fx.inbound(7)).toBe(2)
    fx.update(150, hats, resolveOk, (id) => landed.push(id))
    expect(hats.drawn).toBe(1) // 第二顶还没开始
    fx.update(100 + HAT_DROP_MS, hats, resolveOk, (id) => landed.push(id))
    expect(landed).toEqual([7])
    expect(fx.inbound(7)).toBe(1)
    fx.update(190 + HAT_DROP_MS + 1, hats, resolveOk, (id) => landed.push(id))
    expect(landed).toEqual([7, 7])
    expect(fx.inbound(7)).toBe(0)
  })

  it('drop-on is cancelled silently when the target is gone', () => {
    const fx = new HatFlyFx()
    const landed: number[] = []
    fx.dropOn(7, 0, 3)
    fx.update(10, fakeHats(), () => false, (id) => landed.push(id))
    expect(fx.inbound(7)).toBe(0)
    fx.update(1000, fakeHats(), resolveOk, (id) => landed.push(id))
    expect(landed).toEqual([])
  })

  it('loss: held back on the tower until launch, then lands on its cell once', () => {
    const fx = new HatFlyFx()
    const hats = fakeHats()
    const cells: [number, number][] = []
    fx.lose(4, 1, 2, 1, 3.5, 1.5, 500, 6)
    fx.lose(4, 1, 1.9, 1, 1.5, 3.5, 530, 6)
    expect(fx.heldBack(4, 0)).toBe(2)
    expect(fx.heldBack(4, 510)).toBe(1)
    expect(fx.inbound(4)).toBe(0)
    fx.update(510, hats, resolveOk, undefined, (x, z) => cells.push([x, z]))
    expect(hats.drawn).toBe(1)
    fx.update(530 + HAT_LOSS_MS, hats, resolveOk, undefined, (x, z) => cells.push([x, z]))
    expect(cells).toEqual([
      [3.5, 1.5],
      [1.5, 3.5],
    ])
    expect(fx.heldBack(4, 0)).toBe(0)
  })

  it('drop-on grows into the target level scale (0.85 → 1 × s_target)', () => {
    const fx = new HatFlyFx()
    const hats = fakeHats()
    fx.dropOn(7, 0, 3)
    fx.update(0, hats, resolveOk)
    fx.update(0.25 * HAT_DROP_MS, hats, resolveOk)
    fx.update(0.6 * HAT_DROP_MS, hats, resolveOk)
    expect(hats.scales[0]).toBeCloseTo(0.85 * at.s)
    expect(hats.scales[1]).toBeCloseTo((0.85 + 0.15 * 0.5) * at.s)
    expect(hats.scales[2]).toBeCloseTo(at.s)
  })

  it('loss flies from its launch-level scale and shrinks linearly to 0.75', () => {
    const fx = new HatFlyFx()
    const hats = fakeHats()
    const s = hatLevelScale(3)
    fx.lose(4, 1, 2, 1, 3.5, 1.5, 0, 6, s)
    fx.update(0, hats, resolveOk)
    fx.update(0.5 * HAT_LOSS_MS, hats, resolveOk)
    expect(hats.scales[0]).toBeCloseTo(s)
    expect(hats.scales[1]).toBeCloseTo(lossScale(0.5, s))
    expect(lossScale(1, s)).toBeCloseTo(0.75)
  })
})
