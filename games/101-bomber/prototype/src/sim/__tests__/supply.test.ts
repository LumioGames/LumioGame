import { describe, expect, it } from 'vitest'
import { BlockType, bombCandyPool, PickupKind, msToTicks, type PickupSpawned, type TickFrame } from '../../contract'
import { createPickup } from '../pickup'
import { startMatch } from '../match-phase'
import { makeBomb, type World } from '../world'
import { cell, evs, makeWorld, put, run, setBrick, step, tierOpts } from './helpers'

/**
 * 中央大补给（ADR 0040，design §8.6）：27 档开局后 0:50 全场预告、1:00 在核心中央 3×3 广场开启，公开喷发
 * 糖 ×5（火力 / 炸弹 / 速度）、血包 ×2、狂暴糖 ×1、特殊炸弹 ×2（M1 = Lv1 炸弹类技能糖占位）、金心 ×1；每局 1 次。
 */

function world27(): World {
  const w = makeWorld(tierOpts(27, 2))
  put(w, 1, 1, 1)
  put(w, 2, 25, 25)
  return w
}

/** 跑到 Tick = target（含），返回途中所有帧。 */
function runTo(w: World, target: number): TickFrame[] {
  const out: TickFrame[] = []
  while (w.t < target) out.push(step(w))
  return out
}

function lootCount(loot: readonly PickupSpawned[]) {
  const n = (k: PickupKind) => loot.filter((p) => p.Kind === k).length
  return {
    candies: n(PickupKind.FirePlus) + n(PickupKind.BombPlus) + n(PickupKind.SpeedPlus),
    healthPacks: n(PickupKind.HealthPack),
    frenzy: n(PickupKind.Frenzy),
    specialBombs: n(PickupKind.SkillCandy),
    goldHearts: n(PickupKind.GoldHeart),
  }
}

describe('central supply (27 tier)', () => {
  it('announces at StartTick + 50 000 ms, opens at + 60 000 ms, sprays exactly 5 / 2 / 1 / 2 / 1, once per match', () => {
    const w = world27()
    const start = w.match.startTick
    const announceAt = start + msToTicks(50000, 20)
    const openAt = start + msToTicks(60000, 20)
    const center = cell(w, 13, 13)
    expect(w.supply).toEqual({ cell: center, announceTick: announceAt, openTick: openAt, state: 'pending' })

    const before = runTo(w, announceAt - 1)
    expect(evs(before, 'SupplyAnnounced')).toHaveLength(0)
    expect(before[before.length - 1].snapshot.match.supply?.state).toBe('pending')
    const fa = step(w)
    expect(w.t).toBe(announceAt)
    expect(evs(fa, 'SupplyAnnounced')).toEqual([{ type: 'SupplyAnnounced', presentationOnly: true, Cell: { X: 13, Y: 13 }, AtTick: openAt, Tick: announceAt }])
    expect(fa.snapshot.match.supply).toEqual({ Cell: { X: 13, Y: 13 }, announceTick: announceAt, openTick: openAt, state: 'announced' })

    const mid = runTo(w, openAt - 1)
    expect(evs(mid, 'SupplyOpened')).toHaveLength(0)
    const fo = step(w)
    expect(w.t).toBe(openAt)
    expect(evs(fo, 'SupplyOpened')).toEqual([{ type: 'SupplyOpened', presentationOnly: true, Cell: { X: 13, Y: 13 }, Tick: openAt }])
    expect(fo.snapshot.match.supply?.state).toBe('opened')
    const loot = evs(fo, 'PickupSpawned').filter((p) => p.Source === 'supply')
    expect(lootCount(loot)).toEqual({ candies: 5, healthPacks: 2, frenzy: 1, specialBombs: 2, goldHearts: 1 })
    expect(loot).toHaveLength(11)
    for (const p of loot) {
      expect(p.FromCell).toEqual({ X: 13, Y: 13 })
      expect(p.DroppedByNetEntityIdRaw).toBe(0)
      if (p.Kind === PickupKind.SkillCandy) {
        expect(bombCandyPool(w.rules.skills)).toContain(p.Skill)
        expect(p.SkillLevel).toBe(w.rules.skillCandyLevel)
      }
    }
    expect(new Set(loot.map((p) => `${p.Cell.X},${p.Cell.Y}`)).size).toBe(11)
    // 广场 3×3 先填满（离中心最近的格先用）。
    const plaza = loot.filter((p) => Math.abs(p.Cell.X - 13) <= 1 && Math.abs(p.Cell.Y - 13) <= 1)
    expect(plaza).toHaveLength(9)
    expect(fo.snapshot.Pickups.length).toBeGreaterThanOrEqual(11)

    const after = run(w, 2000)
    expect(evs(after, 'SupplyAnnounced')).toHaveLength(0)
    expect(evs(after, 'SupplyOpened')).toHaveLength(0)
  })

  it('a crowded plaza (bricks around it, pickups and a bomb inside) still gets every item on the nearest free land cells', () => {
    const w = world27()
    const openAt = w.supply!.openTick
    runTo(w, openAt - 1)
    // 广场外一圈全是积木，广场里 4 格被糖果 / 炸弹占着：BFS 只剩 5 格，其余按离中心的距离找最近空地。
    for (let y = 11; y <= 15; y++) for (let x = 11; x <= 15; x++) if (x === 11 || x === 15 || y === 11 || y === 15) setBrick(w, x, y, BlockType.积木)
    for (const [x, y] of [
      [12, 12],
      [14, 12],
      [12, 14],
    ])
      createPickup(w, cell(w, x, y), PickupKind.FirePlus)
    w.bombs.push(makeBomb({ id: w.nextId++, owner: 1, cell: cell(w, 14, 14), bornTick: w.t, fuseEndTick: w.t + 400, power: 1 }))
    const fo = step(w)
    const loot = evs(fo, 'PickupSpawned').filter((p) => p.Source === 'supply')
    expect(lootCount(loot)).toEqual({ candies: 5, healthPacks: 2, frenzy: 1, specialBombs: 2, goldHearts: 1 })
    const cells = loot.map((p) => cell(w, p.Cell.X, p.Cell.Y))
    expect(new Set(cells).size).toBe(11)
    for (const c of cells) {
      expect(w.brick[c]).toBe(BlockType.Air)
      expect(w.ground[c]).not.toBe(BlockType.水)
      expect(c).not.toBe(cell(w, 14, 14))
    }
  })

  it('reschedules for every new match; the 19 tier has none', () => {
    const w = world27()
    startMatch(w, 1)
    expect(w.supply).toMatchObject({ state: 'pending', announceTick: w.match.startTick + 1000, openTick: w.match.startTick + 1200 })
    const old = makeWorld()
    expect(old.supply ?? null).toBeNull()
    const frames = run(old, 1300)
    expect(evs(frames, 'SupplyAnnounced')).toHaveLength(0)
    expect(evs(frames, 'SupplyOpened')).toHaveLength(0)
  })
})
