import { describe, expect, it } from 'vitest'
import { BlockType } from '../../contract'
import { effectiveDetonationTicks, type DetonationBomb } from '../logic/detonation'
import { computeFireCross } from '../logic/fire-preview'
import { PODIUM, podiumCameraPose, podiumOrder, podiumPose, podiumSpots, rowsFromResults, type PodiumEntry } from '../logic/podium'
import { matchResults } from '../../shared/ranking'
import { fogCells, forEachRingDash, insideRing } from '../logic/ring'
import { chooseSpectateTarget, type SpectateCandidate } from '../logic/spectate'

describe('podium ranking', () => {
  const e = (id: number, hats: number, eliminated = false, extra: Partial<PodiumEntry> = {}): PodiumEntry => ({ id, hats, eliminated, ...extra })

  it('orders survivors by hats desc and shares ranks on ties (1, 1, 3)', () => {
    const rows = podiumOrder([e(1, 2), e(2, 5), e(3, 5), e(4, 0)])
    expect(rows.map((r) => [r.id, r.rank, r.place])).toEqual([
      [2, 1, 1],
      [3, 1, 2],
      [1, 3, 3],
      [4, 4, 4],
    ])
  })
  it('an eliminated player with more hats ranks below a 0-hat survivor (D2: last one standing wins)', () => {
    const rows = podiumOrder([e(1, 9, true, { elimTick: 300 }), e(2, 0)])
    expect(rows.map((r) => [r.id, r.rank, r.eliminated])).toEqual([
      [2, 1, false],
      [1, 2, true],
    ])
  })
  it('eliminated players rank by elimination tick, the later one first', () => {
    const rows = podiumOrder([e(4, 0, true, { elimTick: 100 }), e(2, 0, true, { elimTick: 340 }), e(3, 0, true, { elimTick: 200 }), e(9, 0)])
    expect(rows.map((r) => r.id)).toEqual([9, 2, 3, 4])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })
  it('a same-tick elimination shares a rank (id only orders the display, hats do not — design §13, RESOLUTIONS #11)', () => {
    const rows = podiumOrder([e(1, 0, true, { elimTick: 200 }), e(2, 3, true, { elimTick: 200 }), e(3, 1)])
    expect(rows.map((r) => [r.id, r.rank, r.place])).toEqual([
      [3, 1, 1],
      [1, 2, 2],
      [2, 2, 3],
    ])
  })
  it('everyone down: the last batch shares rank 1, laid out by id (podium centre = lowest id)', () => {
    const rows = podiumOrder([e(1, 0, true, { elimTick: 500 }), e(2, 4, true, { elimTick: 500 }), e(3, 7, true, { elimTick: 420 })])
    expect(rows.map((r) => [r.id, r.rank, r.place])).toEqual([
      [1, 1, 1],
      [2, 1, 2],
      [3, 3, 3],
    ])
  })
  it('breaks remaining ties by id so the order is stable', () => {
    const rows = podiumOrder([e(7, 1), e(3, 1), e(5, 1, true, { elimTick: 10 }), e(1, 1, true, { elimTick: 10 })])
    expect(rows.map((r) => r.id)).toEqual([3, 7, 1, 5])
  })
  it('rowsFromResults (sim match.results) gives the same order as podiumOrder', () => {
    const entries = [e(1, 9, true, { elimTick: 300 }), e(2, 0), e(3, 4), e(4, 2, true, { elimTick: 120 })]
    const rows = podiumOrder(entries)
    const results = matchResults(entries.map((x) => ({ id: x.id, hats: x.hats, eliminated: x.eliminated, eliminatedTick: x.elimTick ?? 0 })))
    // 故意打乱行序：rowsFromResults 按 place 排。
    const shuffled = { ...results, rows: [...results.rows].reverse() }
    expect(rowsFromResults(shuffled)).toEqual(rows)
  })
  it('crown and cheer go to every rank-1 row; eliminated 3rd still claps (pose follows rank, design §13)', () => {
    const rows = podiumOrder([e(1, 0, true, { elimTick: 500 }), e(2, 0, true, { elimTick: 500 }), e(3, 0, true, { elimTick: 300 }), e(4, 0, true, { elimTick: 100 })])
    const spots = podiumSpots(rows)
    expect(spots.filter((s) => s.rank === 1).map((s) => s.id)).toEqual([1, 2])
    const by = new Map(spots.map((s) => [s.id, s]))
    expect(by.get(1)!.pose).toBe('cheer')
    // 并列第 1 站在 place 2 的台阶上，也跳跃欢呼（不是挥手）。
    expect(by.get(2)!.place).toBe(2)
    expect(by.get(2)!.pose).toBe('cheer')
    expect(by.get(3)!.rank).toBe(3)
    expect(by.get(3)!.pose).toBe('clap')
    expect(by.get(4)!.pose).toBe('droop')
  })
  it('four players out on the same tick with no survivor: all four rank 1, the one below the steps cheers, never droops', () => {
    const rows = podiumOrder([
      e(1, 0, true, { elimTick: 900 }),
      e(2, 0, true, { elimTick: 900 }),
      e(3, 0, true, { elimTick: 900 }),
      e(4, 0, true, { elimTick: 900 }),
      e(5, 0, true, { elimTick: 400 }),
      e(6, 0, true, { elimTick: 200 }),
    ])
    const spots = podiumSpots(rows)
    const firsts = spots.filter((s) => s.rank === 1)
    expect(firsts.map((s) => s.place)).toEqual([1, 2, 3, 4])
    for (const s of firsts) expect(s.pose, `id ${s.id} place ${s.place}`).toBe('cheer')
    const by = new Map(spots.map((s) => [s.id, s]))
    expect(by.get(5)!.rank).toBe(5)
    expect(by.get(5)!.pose).toBe('droop')
    expect(by.get(6)!.pose).toBe('droop')
  })
  it('podiumPose: tied 2nd both wave, a surviving row claps, an eliminated row droops', () => {
    expect(podiumPose(1, true)).toBe('cheer')
    expect(podiumPose(2, true)).toBe('wave')
    expect(podiumPose(3, false)).toBe('clap')
    expect(podiumPose(4, false)).toBe('clap')
    expect(podiumPose(4, true)).toBe('droop')
  })
  it('places 1st center/tallest, 2nd left, 3rd right, the rest in a row; eliminated droop', () => {
    const rows = podiumOrder([e(1, 9), e(2, 6), e(3, 4), e(4, 1), e(5, 0, true, { elimTick: 3 }), e(6, 0)])
    const spots = podiumSpots(rows)
    const by = new Map(spots.map((s) => [s.id, s]))
    expect(by.get(1)!.x).toBe(0)
    expect(by.get(2)!.x).toBeLessThan(0)
    expect(by.get(3)!.x).toBeGreaterThan(0)
    expect(by.get(1)!.y).toBeGreaterThan(by.get(2)!.y)
    expect(by.get(2)!.y).toBeGreaterThan(by.get(3)!.y)
    expect(by.get(1)!.pose).toBe('cheer')
    expect(by.get(2)!.pose).toBe('wave')
    expect(by.get(3)!.pose).toBe('clap')
    expect(by.get(5)!.pose).toBe('droop')
    expect(by.get(6)!.pose).toBe('clap')
    // 台下一排在台阶前面，左右对称、不出舞台。
    const row = spots.filter((s) => s.place > 3)
    expect(row.every((s) => s.z > PODIUM.stepZ && s.y === PODIUM.stageTop)).toBe(true)
    expect(row[0].x + row[row.length - 1].x).toBeCloseTo(0)
    expect(Math.max(...row.map((s) => Math.abs(s.x)))).toBeLessThan(PODIUM.stageWidth / 2)
    // 第 1 名最后落位（压轴）。
    expect(by.get(1)!.dropSec).toBeGreaterThan(by.get(2)!.dropSec)
  })
  it('cinematic camera ends low (pitch ~21°) in front of the stage and pulls back on portrait screens', () => {
    const o = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 }
    podiumCameraPose(0, 10, 16 / 9, o)
    const startPitch = Math.atan2(o.py - o.ly, Math.hypot(o.px - o.lx, o.pz - o.lz))
    podiumCameraPose(10, 10, 16 / 9, o)
    const endPitch = Math.atan2(o.py - o.ly, Math.hypot(o.px - o.lx, o.pz - o.lz))
    const endDist = Math.hypot(o.px - o.lx, o.py - o.ly, o.pz - o.lz)
    expect((startPitch * 180) / Math.PI).toBeGreaterThan(45)
    expect((endPitch * 180) / Math.PI).toBeGreaterThanOrEqual(18)
    expect((endPitch * 180) / Math.PI).toBeLessThanOrEqual(25)
    expect(o.pz).toBeGreaterThan(0)
    podiumCameraPose(10, 10, 9 / 19.5, o)
    expect(Math.hypot(o.px - o.lx, o.py - o.ly, o.pz - o.lz)).toBeGreaterThan(endDist)
  })
})

describe('final circle ring', () => {
  it('fog covers nothing while the ring is the whole interior', () => {
    expect(fogCells(19, { Min: 1, Max: 17 })).toEqual([])
  })
  it('13×13 ring leaves exactly the 17×17 interior minus 13×13 fogged, never the outer wall', () => {
    const size = 19
    const cells = fogCells(size, { Min: 3, Max: 15 })
    expect(cells.length).toBe(17 * 17 - 13 * 13)
    for (const i of cells) {
      const x = i % size
      const y = Math.floor(i / size)
      expect(x >= 1 && x <= 17 && y >= 1 && y <= 17).toBe(true)
      expect(insideRing(x, y, { Min: 3, Max: 15 })).toBe(false)
    }
    expect(cells).toContain(2 * size + 9)
    expect(cells).not.toContain(3 * size + 3)
    expect(fogCells(size, { Min: 6, Max: 12 }).length).toBe(17 * 17 - 7 * 7)
  })
  it('boundary dashes stay on the ring edge (world [Min, Max+1])', () => {
    const pts: [number, number][] = []
    forEachRingDash({ Min: 5, Max: 13 }, 0.5, 0.3, 0, (x, z) => pts.push([x, z]))
    expect(pts.length).toBeGreaterThan(0)
    for (const [x, z] of pts) {
      expect(x).toBeGreaterThanOrEqual(5)
      expect(x).toBeLessThanOrEqual(14)
      expect(z).toBeGreaterThanOrEqual(5)
      expect(z).toBeLessThanOrEqual(14)
      expect(x === 5 || x === 14 || z === 5 || z === 14).toBe(true)
    }
  })
})

describe('spectate target', () => {
  const c = (id: number, x: number, z: number, followable = true): SpectateCandidate => ({ id, x, z, followable })
  const cands = [c(1, 5, 5, false), c(2, 10, 10), c(3, 3, 4), c(4, 15, 15)]

  it('follows the hat king when he can be followed', () => {
    expect(chooseSpectateTarget(cands, 4, 1, 3, 5, 5)).toBe(4)
  })
  it('keeps the current target instead of flipping to whoever is nearest', () => {
    expect(chooseSpectateTarget(cands, 0, 1, 2, 3, 4)).toBe(2)
  })
  it('falls back to the nearest followable player when the king is gone or dead', () => {
    const dead = [...cands.slice(0, 3), c(4, 15, 15, false)]
    expect(chooseSpectateTarget(dead, 4, 1, 0, 5, 5)).toBe(3)
    expect(chooseSpectateTarget(dead, 4, 1, 4, 11, 11)).toBe(2)
  })
  it('never picks the local player and returns 0 when nobody is left', () => {
    expect(chooseSpectateTarget([c(1, 0, 0), c(2, 1, 1, false)], 1, 1, 1, 0, 0)).toBe(0)
  })
})

describe('chain-aware detonation tick (danger pulse)', () => {
  const size = 9
  const mk = () => ({ size, ground: new Uint8Array(size * size).fill(BlockType.地面), brick: new Uint8Array(size * size) })
  const b = (id: number, x: number, y: number, fuseEndTick: number, power = 2): DetonationBomb => ({ id, x, y, power, fuseEndTick })

  it('a bomb inside an earlier bomb’s cross detonates with it (the reviewed scenario)', () => {
    // A 还剩 6 Tick；B 晚 1 s 放在 A 的十字里，自身引信还剩 26 Tick。
    const t = effectiveDetonationTicks([b(1, 2, 2, 106), b(2, 4, 2, 126)], mk())
    expect(t.get(1)).toBe(106)
    expect(t.get(2)).toBe(106)
  })
  it('propagates transitively along a chain and keeps a bomb’s own earlier fuse', () => {
    const t = effectiveDetonationTicks([b(1, 1, 1, 100), b(2, 3, 1, 140), b(3, 3, 3, 150), b(4, 3, 5, 90, 1)], mk())
    expect(t.get(2)).toBe(100)
    expect(t.get(3)).toBe(100)
    // 4 自己更早（90），而且它的十字（火力 1）盖不到 3：不被拖晚，也不去拖别人。
    expect(t.get(4)).toBe(90)
  })
  it('respects terrain: hard blocks, soft blocks and water stop the propagation', () => {
    const tr = mk()
    tr.brick[2 * size + 3] = BlockType.积木
    const t = effectiveDetonationTicks([b(1, 2, 2, 100), b(2, 4, 2, 150)], tr)
    expect(t.get(2)).toBe(150)
    const tw = mk()
    tw.ground[2 * size + 3] = BlockType.水
    expect(effectiveDetonationTicks([b(1, 2, 2, 100), b(2, 4, 2, 150)], tw).get(2)).toBe(150)
  })
  it('chest cells block the flame like the preview does', () => {
    const blockers = new Set([2 * size + 3])
    expect(effectiveDetonationTicks([b(1, 2, 2, 100), b(2, 4, 2, 150)], mk(), blockers).get(2)).toBe(150)
    const c = computeFireCross(mk(), 2, 2, 3, undefined, blockers)
    expect(c.right).toBe(0)
    expect(c.left).toBe(2)
  })
  it('a bomb placed on the very tick the chain fires is not chained (bornTick < t)', () => {
    const fuse = 42
    // B 在 Tick 100 放下（FuseEnd = 142），A 在 100 引爆：规则层不连锁。
    const t = effectiveDetonationTicks([b(1, 2, 2, 100), b(2, 3, 2, 100 + fuse)], mk(), undefined, fuse)
    expect(t.get(2)).toBe(142)
    const t2 = effectiveDetonationTicks([b(1, 2, 2, 100), b(2, 3, 2, 99 + fuse)], mk(), undefined, fuse)
    expect(t2.get(2)).toBe(100)
  })
})
