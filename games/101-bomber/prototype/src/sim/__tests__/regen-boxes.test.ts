import { describe, expect, it } from 'vitest'
import { BlockType, ZONE_BOX, centerDistance, ringZoneOf, type BricksRegrown } from '../../contract'
import { plazaCells } from '../mapgen'
import { regenBricks } from '../regen'
import type { World } from '../world'
import { makeWorld, put, tierOpts } from './helpers'

/**
 * 再生长箱（ADR 0040，design §5「软砖再生」）：27 档每 8 秒至多 4 组镜像，每组约 1/6 长成当圈等级的资源箱；
 * 保留区 = 本局出生安全区（w.spawns）+ 核心广场；长箱的掷点走新随机流，rng.regen 选格序列不变。
 */

function world27(over: Parameters<typeof tierOpts>[2] = {}): World {
  const w = makeWorld(tierOpts(27, 2, over))
  put(w, 1, 1, 1)
  put(w, 2, 25, 25)
  w.resourceInitial = 100_000
  return w
}

function clearBricks(w: World): void {
  for (let c = 0; c < w.brick.length; c++) if (w.brick[c] === BlockType.积木 || w.brick[c] === BlockType.木箱) w.brick[c] = BlockType.Air
  w.resourceBoxes = []
}

/** 在第 k 个再生节拍上跑一次再生（直接调用，跳过中间 Tick），返回本次的事件。 */
function regenAt(w: World, k: number): BricksRegrown | undefined {
  w.out = []
  w.t = w.match.startTick + k * w.ticks.regenInterval
  regenBricks(w)
  return w.out.find((e): e is BricksRegrown => e.type === 'BricksRegrown')
}

/** 把一次再生的格子按四象限镜像分组（一组 = 一个镜像轨道）。 */
function groups(w: World, e: BricksRegrown): number[][] {
  const S = w.size
  const byKey = new Map<string, number[]>()
  for (const c of e.Cells) {
    const key = `${Math.min(c.X, S - 1 - c.X)},${Math.min(c.Y, S - 1 - c.Y)}`
    const list = byKey.get(key) ?? []
    list.push(c.Y * S + c.X)
    byKey.set(key, list)
  }
  return [...byKey.values()]
}

describe('regen on the 27 tier (ADR 0040)', () => {
  it('≤ 4 mirrored groups per interval, never on spawn zones or the plaza; ~1/6 of groups grow into a box of the ring tier', () => {
    const w = world27()
    const reserved = new Set([...w.spawns.flatMap((z) => z.cells), ...plazaCells(w.size, w.rules.map)])
    expect(plazaCells(w.size, w.rules.map)).toHaveLength(9)
    let total = 0
    let boxes = 0
    for (let k = 1; k <= 800; k++) {
      clearBricks(w)
      const e = regenAt(w, k)
      if (!e) throw new Error(`no regen at beat ${k}`)
      const gs = groups(w, e)
      expect(gs.length).toBeLessThanOrEqual(4)
      for (const g of gs) {
        total++
        const block = w.brick[g[0]]
        for (const c of g) {
          expect(reserved.has(c)).toBe(false)
          expect(w.brick[c]).toBe(block)
        }
        if (block === BlockType.积木) continue
        expect(block).toBe(BlockType.木箱)
        boxes++
        const zone = ringZoneOf(w.rules.map.zones, centerDistance(w.size, g[0] % w.size, Math.floor(g[0] / w.size)))
        for (const c of g) {
          const box = w.resourceBoxes!.find((b) => b.cell === c)
          expect(box).toMatchObject({ tier: ZONE_BOX[zone], hitsRequired: w.rules.map.boxes[ZONE_BOX[zone]].hits, hitBy: [] })
          expect(box!.hitsLeft).toBe(box!.hitsRequired)
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(3000)
    expect(Math.abs((boxes * 1000) / total - 1000 / 6)).toBeLessThanOrEqual(30)
  })

  it('the box roll has its own stream: with boxes switched off the same cells grow and rng.regen ends in the same state', () => {
    const a = world27()
    const b = world27({ map: { ...tierOpts(27).rules!.map!, regenBoxOneIn: 0 } })
    for (let k = 1; k <= 60; k++) {
      clearBricks(a)
      clearBricks(b)
      const ea = regenAt(a, k)
      const eb = regenAt(b, k)
      expect(ea?.Cells).toEqual(eb?.Cells)
    }
    expect(a.rng.regen.state()).toEqual(b.rng.regen.state())
    expect(b.brick.includes(BlockType.木箱)).toBe(false)
  })
})
