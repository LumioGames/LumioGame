import { describe, expect, it } from 'vitest'
import { HatFlyFx } from '../fx/hat-fly'
import {
  diffHatCounts,
  dropLandingOffset,
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
import { HAT, hatStackLayout } from '../logic/hat-layout'
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
    // 空塔落在头顶；n 顶的塔，落点 = 第 n+1 顶的底
    expect(dropLandingOffset(0)).toBe(0)
    for (const n of [1, 3, 7]) {
      const h = hatStackLayout(n).totalHeight
      expect(dropLandingOffset(h)).toBeCloseTo(hatStackLayout(n + 1).offsets[n])
    }
    expect(HAT.spacing).toBeLessThan(HAT.height)
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
  const fakeHats = (): HatRenderer & { drawn: number } => {
    const h = { drawn: 0, hat: () => void h.drawn++ }
    return h as unknown as HatRenderer & { drawn: number }
  }
  const at = { x: 1, y: 2, z: 3 }
  const resolveOk = (_id: number, out: { x: number; y: number; z: number }): boolean => {
    out.x = at.x
    out.y = at.y
    out.z = at.z
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
})
