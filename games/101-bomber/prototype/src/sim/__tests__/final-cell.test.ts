import { describe, expect, it } from 'vitest'
import { BlockType, DEFAULT_CONFIG, DEFAULT_RULES, type BrickDestroyed } from '../../contract'
import { destructibleInside, finalCellBlocker, gridOfSnapshot, type FinalCellGrid } from '../../../tests/support/final-cell'
import { advanceRing, rectView, startFinalCircle } from '../final-circle'
import { LocalSim } from '../local-sim'
import { chestAt, cellOccupied, newId, type World } from '../world'
import { evs, makeWorld, specs } from './helpers'

/**
 * ADR 0031 / design §4.2：最后的 1×1 必须永远可进入。对抗式：真实地图（不清场），每个清场段生效前把 5×5 内
 * 所有空格都塞满积木 / 木箱、3×3 生效前再往中心十字的臂上压宝箱，逐段推进安全圈后检查：
 * 清场段生效后圈内没有可破坏砖、圈内没有宝箱；1×1 生效时中心格砖层为空、不是水、没有宝箱，并能从 5×5 边走进来。
 */

function gridOf(w: World): FinalCellGrid {
  return { size: w.size, brick: w.brick, ground: w.ground, chestCells: w.chests.map((c) => c.cell) }
}

/** 5×5（中心切比雪夫半径 2）内每个空着的非水格都塞一块可破坏砖，积木 / 木箱交替。返回塞了几块。 */
function stuffBricks(w: World): number {
  const mid = (w.size - 1) / 2
  let n = 0
  for (let y = mid - 2; y <= mid + 2; y++)
    for (let x = mid - 2; x <= mid + 2; x++) {
      const c = y * w.size + x
      if (w.brick[c] !== BlockType.Air || w.ground[c] === BlockType.水 || cellOccupied(w, c)) continue
      w.brick[c] = (x + y) % 2 === 0 ? BlockType.积木 : BlockType.木箱
      n++
    }
  return n
}

/** 中心十字 4 条臂上没被占的格各压一个满血宝箱（先腾出砖层）。 */
function stuffArmChests(w: World): void {
  const mid = (w.size - 1) / 2
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    const c = (mid + dy) * w.size + mid + dx
    if (chestAt(w, c) || w.ground[c] === BlockType.水) continue
    w.brick[c] = BlockType.Air
    const hits = w.rules.chestHitsRequired
    w.chests.push({ id: newId(w), cell: c, hitsRequired: hits, stageIndex: 0, bornTick: w.t, hitsLeft: hits, hitBy: [], opener: 0 })
  }
}

/** 19×19 上 5×5 / 3×3 / 1×1 内非铁皮格数的上限（铁皮柱在偶数行列交点）。 */
const MAX_CLEARED: Readonly<Record<number, number>> = { 5: 21, 3: 5, 1: 1 }

describe('final 1×1 cell is always enterable', () => {
  it('seeds 1..100, real maps, adversarial bricks and chests: every clearing stage empties its ring and the 1×1 is enterable', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const w = makeWorld({ seed, players: 8, clear: false })
      startFinalCircle(w, 'time')
      const fc = w.finalCircle!
      const stages = w.ticks.ringStages
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i]
        const at = fc.startTick + s.at
        w.t = Math.max(w.t, at - w.ticks.ringPreview)
        advanceRing(w)
        expect(fc.announced, `seed ${seed} stage ${i}`).toBe(i + 1)
        if (s.clearInside) {
          stuffBricks(w)
          if (s.size >= 3) stuffArmChests(w)
        }
        const before = destructibleInside(gridOf(w), rectView(w.finalCircle!.nextRing!)).length
        w.out = []
        w.t = at
        advanceRing(w)
        expect(fc.stageIndex, `seed ${seed} stage ${i}`).toBe(i)
        const destroyed = w.out.filter((e): e is BrickDestroyed => e.type === 'BrickDestroyed')
        const ring = rectView(fc.ring)
        if (!s.clearInside) {
          expect(destroyed, `seed ${seed} stage ${i}`).toHaveLength(0)
          continue
        }
        expect(destructibleInside(gridOf(w), ring), `seed ${seed} stage ${i}`).toEqual([])
        expect(destroyed).toHaveLength(before)
        expect(destroyed.length).toBeLessThanOrEqual(MAX_CLEARED[s.size])
        expect(destroyed.every((e) => e.ChainId === 0 && e.OwnerNetEntityIdRaw === 0)).toBe(true)
        for (const ch of w.chests) {
          const x = ch.cell % w.size
          const y = Math.floor(ch.cell / w.size)
          expect(x >= ring.Min && x <= ring.Max && y >= ring.Min && y <= ring.Max, `seed ${seed} stage ${i} chest (${x},${y})`).toBe(false)
        }
        if (s.size === 5) expect(destroyed.length, `seed ${seed}`).toBeGreaterThan(0)
      }
      expect(fc.ring).toEqual({ min: 9, max: 9 })
      expect(finalCellBlocker(gridOf(w)), `seed ${seed}`).toBeNull()
    }
  })

  it('full pipeline: at every clearing RingShrunk frame the published terrain has no destructible brick inside and the 1×1 is enterable', () => {
    for (const seed of [3, 7, 11]) {
      // 单人局不会提前结束：安全圈一定走到 1×1。
      const config = { ...DEFAULT_CONFIG, matchDurationMs: 116_000 }
      const sim = new LocalSim({ seed, config, rules: { ...DEFAULT_RULES, playerCount: 1 }, players: specs(1) })
      const clearing = new Set(DEFAULT_RULES.ringStages.flatMap((s, i) => (s.clearInside ? [i] : [])))
      const checked: number[] = []
      for (let i = 0; i < 2600 && checked.length < clearing.size; i++) {
        const f = sim.step(new Map())
        for (const e of evs(f, 'RingShrunk')) {
          if (!clearing.has(e.StageIndex)) continue
          const g = gridOfSnapshot(f.snapshot)
          expect(destructibleInside(g, e.Ring), `seed ${seed} stage ${e.StageIndex}`).toEqual([])
          if (e.Ring.Min === e.Ring.Max) expect(finalCellBlocker(g), `seed ${seed}`).toBeNull()
          checked.push(e.StageIndex)
        }
      }
      expect(checked).toEqual([...clearing])
    }
  })
})
