import { describe, expect, it } from 'vitest'
import { BlockType, DEFAULT_CONFIG, DEFAULT_RULES, type BrickDestroyed } from '../../contract'
import { destructibleInside, finalCellBlocker, gridOfSnapshot, type FinalCellGrid } from '../../../tests/support/final-cell'
import { advanceRing, rectView, regenActive, startFinalCircle } from '../final-circle'
import { LocalSim } from '../local-sim'
import { chestAt, cellOccupied, newId, type World } from '../world'
import { evs, makeWorld, specs } from './helpers'

/**
 * ADR 0031 / design §4.2：最后的 1×1 必须永远可进入。对抗式：真实地图（不清场），每个清场段生效前把「即将清场的那一圈」
 * 所有空格都塞满积木 / 木箱；3×3 生效前（落箱避让允许的唯一时机）若中心十字上还没有宝箱，再往一条臂上压一个满血宝箱。
 * 逐段推进安全圈后检查：清场段生效后圈内没有可破坏砖、宝箱一个不少且都没被开启（清场只清砖）；决赛圈全程软砖不再生；
 * 1×1 生效时中心格砖层为空、不是水、没有宝箱，并能从 5×5 边走进来。另跑一遍宝箱不喷战利品的规则，确保不是糖果在替地形挡砖。
 */

function gridOf(w: World): FinalCellGrid {
  return { size: w.size, brick: w.brick, ground: w.ground, chestCells: w.chests.map((c) => c.cell) }
}

/** 中心切比雪夫半径 r 内（= 即将清场的圈）每个空着的非水格都塞一块可破坏砖，积木 / 木箱交替。返回塞了几块。 */
function stuffBricks(w: World, r: number): number {
  const mid = (w.size - 1) / 2
  let n = 0
  for (let y = mid - r; y <= mid + r; y++)
    for (let x = mid - r; x <= mid + r; x++) {
      const c = y * w.size + x
      if (w.brick[c] !== BlockType.Air || w.ground[c] === BlockType.水 || cellOccupied(w, c)) continue
      w.brick[c] = (x + y) % 2 === 0 ? BlockType.积木 : BlockType.木箱
      n++
    }
  return n
}

const ARMS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const

/**
 * 落箱避让（RESOLUTIONS #20）允许的最坏情况：3×3 段起中心十字上至多一个宝箱。已经有（3×3 段的真实落箱压在臂上）就不再加；
 * 否则在第一条可用的臂上压一个满血宝箱（先腾出砖层）。
 */
function stuffArmChest(w: World): void {
  const mid = (w.size - 1) / 2
  const armCells = ARMS.map(([dx, dy]) => (mid + dy) * w.size + mid + dx)
  if (armCells.some((c) => chestAt(w, c))) return
  for (const c of armCells) {
    if (w.ground[c] === BlockType.水 || cellOccupied(w, c)) continue
    w.brick[c] = BlockType.Air
    const hits = w.rules.chestHitsRequired
    w.chests.push({ id: newId(w), cell: c, hitsRequired: hits, stageIndex: 0, bornTick: w.t, hitsLeft: hits, hitBy: [], opener: 0 })
    return
  }
}

/** 19×19 上 5×5 / 3×3 / 1×1 内非铁皮格数的上限（铁皮柱在偶数行列交点）。 */
const MAX_CLEARED: Readonly<Record<number, number>> = { 5: 21, 3: 5, 1: 1 }

describe('final 1×1 cell is always enterable', () => {
  for (const [label, rules] of [
    ['default rules', {}],
    ['no chest loot', { chestLoot: [], chestSkillCandies: 0 }],
  ] as const) {
    it(`${label}: seeds 1..100, real maps, adversarial bricks and a keep-out-compliant arm chest: every clearing stage empties its ring of bricks, leaves chests alone, and the 1×1 is enterable`, () => {
      for (let seed = 1; seed <= 100; seed++) {
        const w = makeWorld({ seed, players: 8, clear: false, rules })
        startFinalCircle(w, 'time')
        const fc = w.finalCircle!
        const stages = w.ticks.ringStages
        for (let i = 0; i < stages.length; i++) {
          const s = stages[i]
          const at = fc.startTick + s.at
          w.t = Math.max(w.t, at - w.ticks.ringPreview)
          advanceRing(w)
          expect(regenActive(w), `seed ${seed} stage ${i}`).toBe(false)
          expect(fc.announced, `seed ${seed} stage ${i}`).toBe(i + 1)
          if (s.clearInside) {
            stuffBricks(w, (s.size - 1) / 2)
            if (s.size === 3) stuffArmChest(w)
          }
          const before = destructibleInside(gridOf(w), rectView(w.finalCircle!.nextRing!)).length
          const chestsBefore = w.chests.map((c) => ({ id: c.id, hitsLeft: c.hitsLeft }))
          w.out = []
          w.t = at
          advanceRing(w)
          expect(regenActive(w), `seed ${seed} stage ${i}`).toBe(false)
          expect(fc.stageIndex, `seed ${seed} stage ${i}`).toBe(i)
          const destroyed = w.out.filter((e): e is BrickDestroyed => e.type === 'BrickDestroyed')
          const ring = rectView(fc.ring)
          // 清场也好不清场也好，生效都不碰宝箱：不开、不删、不改命中数。
          expect(w.chests.map((c) => ({ id: c.id, hitsLeft: c.hitsLeft })), `seed ${seed} stage ${i}`).toEqual(chestsBefore)
          expect(w.out.filter((e) => e.type === 'ChestOpened'), `seed ${seed} stage ${i}`).toHaveLength(0)
          if (!s.clearInside) {
            expect(destroyed, `seed ${seed} stage ${i}`).toHaveLength(0)
            continue
          }
          expect(destructibleInside(gridOf(w), ring), `seed ${seed} stage ${i}`).toEqual([])
          expect(destroyed).toHaveLength(before)
          expect(destroyed.length).toBeLessThanOrEqual(MAX_CLEARED[s.size])
          expect(destroyed.every((e) => e.ChainId === 0 && e.OwnerNetEntityIdRaw === 0)).toBe(true)
          if (s.size === 5) expect(destroyed.length, `seed ${seed}`).toBeGreaterThan(0)
        }
        expect(fc.ring).toEqual({ min: 9, max: 9 })
        const mid = (w.size - 1) / 2
        const armChests = ARMS.filter(([dx, dy]) => chestAt(w, (mid + dy) * w.size + mid + dx))
        expect(armChests.length, `seed ${seed}`).toBeLessThanOrEqual(1)
        expect(finalCellBlocker(gridOf(w)), `seed ${seed}`).toBeNull()
      }
    })
  }

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
