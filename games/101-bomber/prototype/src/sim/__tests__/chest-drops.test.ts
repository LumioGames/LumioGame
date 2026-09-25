import { describe, expect, it } from 'vitest'
import { BlockType, PickupKind, 方向 } from '../../contract'
import { createPickup } from '../pickup'
import type { SimChest, World } from '../world'
import { addBomb, BOMB, cell, evs, makeWorld, mv, player, put, run, setBrick, step } from './helpers'

/** design §4.2 强力宝箱与 §8.5 死亡掉强化（ADR 0025）。 */

function putChest(w: World, x: number, y: number, hits = w.rules.chestHitsRequired): SimChest {
  const c: SimChest = { id: w.nextId++, cell: cell(w, x, y), hitsRequired: hits, stageIndex: 0, bornTick: w.t, hitsLeft: hits, hitBy: [], opener: 0 }
  w.chests.push(c)
  return c
}

describe('strong chest', () => {
  it('three distinct bombs of one chain each hit once, the arms stop at the chest, and it opens into the loot', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const chest = putChest(w, 9, 5)
    // A → C → B、A → E → F 同链；A、B、F 三颗的臂各停在宝箱上。
    const a = addBomb(w, 1, 9, 7, 1, 2)
    const c = addBomb(w, 2, 11, 7, 40, 2)
    const b = addBomb(w, 2, 11, 5, 40, 2)
    const e = addBomb(w, 1, 7, 7, 40, 2)
    const f0 = addBomb(w, 1, 7, 5, 40, 2)
    const f = step(w)
    expect([a, b, c, e, f0].every((x) => x.chainId === a.id)).toBe(true)
    expect(a.reachUp).toBe(1)
    expect(b.reachLeft).toBe(1)
    expect(f0.reachRight).toBe(1)
    for (const x of [a, b, c, e, f0]) expect(x.covered).not.toContain(chest.cell)
    const hits = evs(f, 'ChestHit')
    expect(hits.map((h) => [h.HitsLeft, h.ChainId])).toEqual([
      [2, a.id],
      [1, a.id],
      [0, a.id],
    ])
    const opened = evs(f, 'ChestOpened')
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ ChestNetEntityIdRaw: chest.id, Cell: { X: 9, Y: 5 }, OpenerNetEntityIdRaw: hits[2].SourceBombOwnerNetEntityIdRaw })
    expect(f.snapshot.Chests).toHaveLength(0)
    const loot = evs(f, 'PickupSpawned').filter((p) => p.Source === 'chest')
    expect(loot.map((p) => p.Kind)).toEqual([PickupKind.FirePlus, PickupKind.BombPlus, PickupKind.SpeedPlus, PickupKind.HealthPack])
    expect(loot[0].Cell).toEqual({ X: 9, Y: 5 })
    expect(loot.every((p) => p.DroppedByNetEntityIdRaw === 0 && p.FromCell.X === 9 && p.FromCell.Y === 5)).toBe(true)
    expect(new Set(loot.map((p) => `${p.Cell.X},${p.Cell.Y}`)).size).toBe(4)
    for (const p of loot) expect(Math.abs(p.Cell.X - 9) + Math.abs(p.Cell.Y - 5)).toBeLessThanOrEqual(2)
    // 宝箱不出帽子。
    expect(evs(f, 'HatPileSpawned')).toHaveLength(0)
  })

  it('hits accumulate over ticks; the snapshot shows HitsLeft until it opens', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 15, 13)
    const chest = putChest(w, 9, 5)
    addBomb(w, 1, 9, 7, 1)
    const f1 = step(w)
    expect(f1.snapshot.Chests).toMatchObject([{ NetEntityIdRaw: chest.id, chest: { HitsLeft: 2, HitsRequired: 3, StageIndex: 0 } }])
    run(w, 10)
    addBomb(w, 2, 9, 3, 1)
    const f2 = step(w)
    expect(evs(f2, 'ChestHit')).toMatchObject([{ HitsLeft: 1, SourceBombOwnerNetEntityIdRaw: 2 }])
    run(w, 10)
    addBomb(w, 2, 7, 5, 1)
    const f3 = step(w)
    expect(evs(f3, 'ChestOpened')).toMatchObject([{ OpenerNetEntityIdRaw: 2 }])
    expect(w.chests).toHaveLength(0)
  })

  it('blocks movement, bomb placement next to it is fine, and fire behind it is shielded', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 15, 15)
    const p = put(w, 2, 9, 3)
    const behind = put(w, 3, 9, 4)
    putChest(w, 9, 5)
    run(w, 10, { 3: [mv(方向.下, true)] })
    expect(behind.my).toBe(4500)
    addBomb(w, 1, 9, 7, 1, 4)
    const f = step(w)
    expect(evs(f, 'DamageApplied')).toHaveLength(0)
    expect(p.health).toBe(w.cfg.maxHealthPoints)
    expect(evs(step(w, { 2: [BOMB] }), 'BombPlaced')).toHaveLength(1)
  })
})

describe('death power-up drops', () => {
  function victimWithLevels(w: World): ReturnType<typeof player> {
    const v = put(w, 2, 9, 9)
    v.health = 2
    v.power = w.cfg.initialBombPower + 2
    v.capacity = w.cfg.initialBombCapacity + 2
    v.speed = w.cfg.speedTierToCellsPerSecond[0] + 3 * w.rules.speedStepMilli
    return v
  }

  it('at 100% every level drops: victim back to base, one death pickup per level near the death cell', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 15, 15)
    const v = victimWithLevels(w)
    addBomb(w, 1, 9, 11, 1)
    step(w)
    const f = step(w)
    expect(v.power).toBe(w.cfg.initialBombPower)
    expect(v.capacity).toBe(w.cfg.initialBombCapacity)
    expect(v.speed).toBe(w.cfg.speedTierToCellsPerSecond[0])
    const dropped = evs(f, 'PowerupsDropped')
    expect(dropped).toHaveLength(1)
    expect(dropped[0]).toMatchObject({ VictimNetEntityIdRaw: 2, Cell: { X: 9, Y: 9 } })
    const K = PickupKind
    expect(dropped[0].Kinds).toEqual([K.FirePlus, K.FirePlus, K.BombPlus, K.BombPlus, K.SpeedPlus, K.SpeedPlus, K.SpeedPlus])
    const sp = evs(f, 'PickupSpawned').filter((e) => e.Source === 'death')
    expect(sp.map((e) => e.Kind)).toEqual(dropped[0].Kinds)
    expect(sp.every((e) => e.DroppedByNetEntityIdRaw === 2 && e.FromCell.X === 9 && e.FromCell.Y === 9)).toBe(true)
    expect(new Set(sp.map((e) => `${e.Cell.X},${e.Cell.Y}`)).size).toBe(sp.length)
    for (const e of sp) {
      expect(Math.abs(e.Cell.X - 9) + Math.abs(e.Cell.Y - 9)).toBeLessThanOrEqual(3)
      expect(w.brick[cell(w, e.Cell.X, e.Cell.Y)]).toBe(BlockType.Air)
      expect(w.ground[cell(w, e.Cell.X, e.Cell.Y)]).not.toBe(BlockType.水)
    }
    expect(f.snapshot.Pickups.filter((p) => p.droppedBy === 2)).toHaveLength(7)
    expect(f.snapshot.Pickups.filter((p) => p.droppedBy === 0)).toHaveLength(0)
  })

  it('at 0% nothing drops and the victim keeps every level; a base-level victim rolls nothing', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 0 } })
    put(w, 1, 15, 15)
    const v = victimWithLevels(w)
    addBomb(w, 1, 9, 11, 1)
    step(w)
    const f = step(w)
    expect(evs(f, 'PowerupsDropped')).toHaveLength(0)
    expect(v.power).toBe(w.cfg.initialBombPower + 2)

    const w2 = makeWorld()
    put(w2, 1, 15, 15)
    put(w2, 2, 9, 9).health = 2
    addBomb(w2, 1, 9, 11, 1)
    step(w2)
    const before = w2.rng.drop.state()
    const f2 = step(w2)
    expect(evs(f2, 'PowerupsDropped')).toHaveLength(0)
    expect(w2.rng.drop.state()).toEqual(before)
  })

  it('conservation over seeds at 50%: dropped levels == spawned death pickups; health packs never drop', () => {
    let totalDropped = 0
    for (let seed = 1; seed <= 12; seed++) {
      const w = makeWorld({ seed })
      put(w, 1, 15, 15)
      const v = victimWithLevels(w)
      v.health = 2
      const levels = () => v.power + v.capacity + Math.round(v.speed / w.rules.speedStepMilli)
      const before = levels()
      addBomb(w, 1, 9, 11, 1)
      step(w)
      const f = step(w)
      const sp = evs(f, 'PickupSpawned').filter((e) => e.Source === 'death')
      expect(before - levels()).toBe(sp.length)
      expect(sp.every((e) => e.Kind !== PickupKind.HealthPack)).toBe(true)
      totalDropped += sp.length
    }
    expect(totalDropped).toBeGreaterThan(20)
    expect(totalDropped).toBeLessThan(64)
  })

  it('when free cells run out the rest are lost (levels still removed)', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 15, 15)
    const v = victimWithLevels(w)
    // 用铁皮把 (9,9) 围到只剩向上一格 (9,8)，(9,8) 两侧本就是铁皮柱。
    setBrick(w, 9, 10, BlockType.铁皮)
    setBrick(w, 8, 9, BlockType.铁皮)
    setBrick(w, 10, 9, BlockType.铁皮)
    setBrick(w, 9, 7, BlockType.铁皮)
    // 被自己的炸弹炸死（放在自己脚下）。
    addBomb(w, 2, 9, 9, 1)
    step(w)
    const f = step(w)
    const sp = evs(f, 'PickupSpawned').filter((e) => e.Source === 'death')
    // 死亡格有炸弹（爆炸态）不落；可用的只有 (9,8)。
    expect(sp.map((e) => e.Cell)).toEqual([{ X: 9, Y: 8 }])
    expect(evs(f, 'PowerupsDropped')[0].Kinds).toHaveLength(1)
    expect(v.power).toBe(w.cfg.initialBombPower)
    expect(v.speed).toBe(w.cfg.speedTierToCellsPerSecond[0])
  })

  it('a dropped bomb level with nothing in hand is taken from the next bomb that returns', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 15, 15)
    const v = put(w, 2, 9, 9)
    v.health = 2
    v.capacity = 0
    addBomb(w, 2, 1, 1, 30)
    addBomb(w, 2, 17, 1, 30)
    addBomb(w, 1, 9, 11, 1)
    step(w)
    step(w)
    expect(v.capacity).toBe(0)
    expect(v.capacityDebt).toBe(1)
    run(w, 30)
    expect(v.capacityDebt).toBe(0)
    expect(v.capacity).toBe(w.cfg.initialBombCapacity)
  })

  it('a dropped pickup can be picked up by anyone and restores the level', () => {
    const w = makeWorld()
    put(w, 1, 5, 5)
    createPickup(w, cell(w, 5, 5), PickupKind.FirePlus, { source: 'death', droppedBy: 2, fromCell: cell(w, 5, 5) })
    expect(evs(step(w), 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 1, Kind: PickupKind.FirePlus }])
    expect(player(w, 1).power).toBe(w.cfg.initialBombPower + 1)
  })
})
