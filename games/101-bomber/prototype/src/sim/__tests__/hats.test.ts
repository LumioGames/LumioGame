import { describe, expect, it } from 'vitest'
import { PickupKind } from '../../contract'
import { removePlayerFromWorld } from '../hats'
import { makePickup, newId, type World } from '../world'
import { addBomb, BOMB, cell, evs, giveLevels, hats, makeWorld, player, put, run, startCircle, step } from './helpers'

/**
 * ADR 0028 / design §9：帽子不是独立资源，HatCount = 当前强化级数之和（派生）。
 * 没有铸帽、没有帽堆、没有守恒账；死亡掉几级强化帽数就少几顶，决赛圈出局全掉。
 */

const K = PickupKind

function drop(w: World, x: number, y: number, kind: PickupKind, droppedBy = 0): void {
  w.pickups.push(makePickup({ id: newId(w), cell: cell(w, x, y), kind, bornTick: w.t - 1, droppedBy }))
}

function snapHats(f: ReturnType<typeof step>, id: number): number {
  return f.snapshot.Players.find((p) => p.NetEntityIdRaw === id)!.BomberPlayerState.HatCount
}

const HAT_RESOURCE_EVENTS = ['HatMinted', 'HatPileSpawned', 'HatPilePicked', 'HatPileExpired'] as const

function noHatResourceEvents(frames: ReturnType<typeof step> | ReturnType<typeof step>[]): void {
  for (const t of HAT_RESOURCE_EVENTS) expect(evs(frames, t)).toHaveLength(0)
}

describe('HatCount is derived from power-up levels', () => {
  it('each FirePlus / BombPlus / SpeedPlus raises it by 1, a health pack does not; nothing is minted', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const frames = []
    drop(w, 1, 1, K.FirePlus)
    frames.push(step(w))
    expect(snapHats(frames[0], 1)).toBe(1)
    drop(w, 1, 1, K.BombPlus)
    frames.push(step(w))
    expect(hats(w, 1)).toBe(2)
    drop(w, 1, 1, K.SpeedPlus, 2)
    frames.push(step(w))
    expect(hats(w, 1)).toBe(3)
    player(w, 1).health = 2
    drop(w, 1, 1, K.HealthPack)
    const f = step(w)
    frames.push(f)
    expect(evs(f, 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 1, Kind: K.HealthPack }])
    expect(snapHats(f, 1)).toBe(3)
    expect(snapHats(f, 2)).toBe(0)
    expect(f.snapshot.HatPiles).toEqual([])
    noHatResourceEvents(frames)
  })

  it('a bomb on the field still counts as a BombPlus level (capacity = in hand + live bombs)', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    giveLevels(w, 1, 0, 1, 0)
    expect(hats(w, 1)).toBe(1)
    expect(evs(step(w, { 1: [BOMB] }), 'BombPlaced')).toHaveLength(1)
    expect(player(w, 1).capacity).toBe(w.cfg.initialBombCapacity)
    expect(hats(w, 1)).toBe(1)
  })

  it('a SpeedPlus truncated by the speed cap still counts as a full level; at-cap pickups are refused and change nothing', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    put(w, 2, 17, 17)
    const maxSpeed = Math.ceil((w.rules.speedCapMilli - w.cfg.speedTierToCellsPerSecond[0]) / w.rules.speedStepMilli)
    giveLevels(w, 1, 0, 0, maxSpeed - 1)
    drop(w, 1, 1, K.SpeedPlus)
    step(w)
    expect(player(w, 1).speed).toBe(w.rules.speedCapMilli)
    expect(hats(w, 1)).toBe(maxSpeed)
    drop(w, 1, 1, K.SpeedPlus)
    player(w, 1).power = w.rules.powerCap
    drop(w, 1, 1, K.FirePlus)
    const before = hats(w, 1)
    const f = step(w)
    expect(evs(f, 'PickupTaken')).toHaveLength(0)
    expect(w.pickups).toHaveLength(2)
    expect(hats(w, 1)).toBe(before)
  })

  it('the default caps allow at most 17 hats (4 fire + 5 bomb + 8 speed)', () => {
    const w = makeWorld()
    put(w, 1, 1, 1)
    const p = player(w, 1)
    p.power = w.rules.powerCap
    p.capacity = w.rules.capacityCap
    p.speed = w.rules.speedCapMilli
    expect(hats(w, 1)).toBe(17)
  })
})

describe('death drops take hats with them', () => {
  it('normal death: HatCount falls by exactly the rolled levels, HatsLost matches, the killer gains nothing', () => {
    let total = 0
    let partial = 0
    for (let seed = 1; seed <= 10; seed++) {
      const w = makeWorld({ seed })
      put(w, 1, 15, 15)
      put(w, 2, 9, 9)
      giveLevels(w, 2, 2, 2, 3).health = 2
      expect(hats(w, 2)).toBe(7)
      addBomb(w, 1, 9, 11, 1)
      const fd = step(w)
      const died = evs(fd, 'PlayerDied')
      expect(died).toHaveLength(1)
      const lost = died[0].proto!.HatsLost
      // 死亡帧：还没掉，帽子还在身上。
      expect(snapHats(fd, 2)).toBe(7)
      const f1 = step(w)
      expect(snapHats(f1, 2)).toBe(7 - lost)
      expect(snapHats(f1, 1)).toBe(0)
      const dropped = evs(f1, 'PowerupsDropped')
      const spawned = evs(f1, 'PickupSpawned').filter((e) => e.Source === 'death')
      expect(spawned).toHaveLength(lost)
      if (lost > 0) expect(dropped[0].Kinds).toHaveLength(lost)
      noHatResourceEvents([fd, f1])
      total += lost
      if (lost > 0 && lost < 7) partial++
    }
    expect(total).toBeGreaterThan(15)
    expect(total).toBeLessThan(55)
    expect(partial).toBeGreaterThan(0)
  })

  it('mutual kills: both lose their dropped levels, nobody is minted a hat', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    giveLevels(w, 1, 1, 0, 0)
    giveLevels(w, 2, 0, 0, 2)
    put(w, 1, 1, 1).health = 2
    put(w, 2, 3, 3).health = 2
    addBomb(w, 1, 3, 5, 1)
    addBomb(w, 2, 1, 3, 1)
    const f = step(w)
    expect(evs(f, 'PlayerDied').map((d) => [d.VictimNetEntityIdRaw, d.proto?.HatsLost])).toEqual([
      [2, 2],
      [1, 1],
    ])
    const f1 = step(w)
    expect(hats(w, 1) + hats(w, 2)).toBe(0)
    expect(evs(f1, 'PickupSpawned').filter((e) => e.Source === 'death')).toHaveLength(3)
    noHatResourceEvents([f, f1])
  })

  it('a kill on the EndTick tick is settled before Settlement freezes: levels dropped, crown recomputed, MatchEnded last', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 15, 15)
    const v = put(w, 2, 1, 1)
    giveLevels(w, 2, 1, 1, 2).health = 2
    step(w)
    expect(w.match.hatKing).toBe(2)
    w.match.endTick = w.t + 1
    addBomb(w, 1, 3, 1, 1)
    const f = step(w)
    const types = f.events.map((e) => e.type)
    expect(types.indexOf('PowerupsDropped')).toBeGreaterThan(types.indexOf('PlayerDied'))
    expect(types[types.length - 1]).toBe('MatchEnded')
    expect(f.snapshot.BomberMatchState.Phase).toBe(3)
    expect(evs(f, 'PlayerDied')[0].proto?.HatsLost).toBe(4)
    expect(snapHats(f, 2)).toBe(0)
    expect(snapHats(f, 1)).toBe(0)
    expect(v.power).toBe(w.cfg.initialBombPower)
    expect(evs(f, 'HatKingChanged')).toMatchObject([{ PreviousHatKingNetEntityIdRaw: 2, NewHatKingNetEntityIdRaw: 0 }])
    expect(f.snapshot.BomberMatchState.HatKingNetEntityIdRaw).toBe(0)
    expect(w.pendingDeaths).toHaveLength(0)
    noHatResourceEvents(f)
    expect(run(w, 20).flatMap((x) => x.events)).toHaveLength(0)
  })
})

describe('final-circle elimination drops everything', () => {
  it('a death inside the circle drops ALL levels without rolling (HatCount 0), HatsLost = all levels', () => {
    // 0‰ 证明出局不是掷出来的。
    const w = makeWorld({ players: 3, rules: { deathPowerupDropPermille: 0 } })
    put(w, 1, 15, 15)
    put(w, 3, 17, 1)
    put(w, 2, 9, 9)
    giveLevels(w, 2, 2, 2, 3).health = 2
    startCircle(w)
    addBomb(w, 1, 9, 11, 1)
    const fd = step(w)
    expect(evs(fd, 'PlayerDied')[0].proto?.HatsLost).toBe(7)
    const f1 = step(w)
    expect(evs(f1, 'PlayerEliminated')).toMatchObject([{ NetEntityIdRaw: 2 }])
    expect(snapHats(f1, 2)).toBe(0)
    expect(player(w, 2).eliminated).toBe(true)
    expect(evs(f1, 'PowerupsDropped')[0].Kinds).toHaveLength(7)
    expect(evs(f1, 'PickupSpawned').filter((e) => e.Source === 'death' && e.DroppedByNetEntityIdRaw === 2)).toHaveLength(7)
    noHatResourceEvents([fd, f1])
  })

  it('a death on the very tick the circle starts is an elimination: all levels drop and HatsLost is promoted', () => {
    const w = makeWorld({ players: 3, rules: { deathPowerupDropPermille: 0 } })
    put(w, 1, 15, 15)
    put(w, 3, 17, 1)
    put(w, 2, 9, 9)
    giveLevels(w, 2, 1, 2, 1).health = 2
    // 时间触发落在下一个 Tick 的阶段机里，而同一 Tick 的伤害结算更早。
    w.match.endTick = w.t + 1 + w.ticks.finalCircle
    addBomb(w, 1, 9, 11, 1)
    const fd = step(w)
    const died = evs(fd, 'PlayerDied')
    const started = evs(fd, 'FinalCircleStarted')
    expect(started).toHaveLength(1)
    expect(died[0].Tick).toBe(started[0].Tick)
    expect(died[0].proto?.HatsLost).toBe(4)
    expect(w.pendingDeaths[0].dropKinds).toEqual([K.FirePlus, K.BombPlus, K.BombPlus, K.SpeedPlus])
    const f1 = step(w)
    expect(evs(f1, 'PlayerEliminated')).toMatchObject([{ NetEntityIdRaw: 2 }])
    expect(snapHats(f1, 2)).toBe(0)
    expect(evs(f1, 'PickupSpawned').filter((e) => e.Source === 'death')).toHaveLength(4)
  })

  it('processDeaths still upgrades a pre-rolled drop to all levels if the death tick is inside the circle', () => {
    const w = makeWorld({ players: 3, rules: { deathPowerupDropPermille: 0 } })
    put(w, 1, 15, 15)
    put(w, 3, 17, 1)
    const v = put(w, 2, 9, 9)
    giveLevels(w, 2, 1, 1, 0)
    v.health = 0
    startCircle(w)
    w.pendingDeaths.push({ victim: 2, killer: 1, tick: w.t, dropKinds: [], dropSkills: [] })
    const f = step(w)
    expect(evs(f, 'PlayerEliminated')).toHaveLength(1)
    expect(hats(w, 2)).toBe(0)
    expect(evs(f, 'PowerupsDropped')[0].Kinds).toEqual([K.FirePlus, K.BombPlus])
  })

  it('a posthumous kill by an eliminated player mints nothing; the victim is eliminated with 0 hats', () => {
    const w = makeWorld({ players: 3 })
    put(w, 3, 15, 15)
    const k = put(w, 1, 9, 9)
    put(w, 2, 1, 1)
    giveLevels(w, 2, 1, 0, 1).health = 2
    startCircle(w)
    addBomb(w, 1, 3, 1, 3)
    k.health = 0
    k.eliminated = true
    const frames = run(w, 4)
    expect(evs(frames, 'PlayerDied')).toMatchObject([{ VictimNetEntityIdRaw: 2, KillerNetEntityIdRaw: 1, proto: { HatsLost: 2 } }])
    expect(hats(w, 1)).toBe(0)
    expect(hats(w, 2)).toBe(0)
    noHatResourceEvents(frames)
  })
})

describe('hat king and leaving', () => {
  it('the crown follows the derived count; a tie keeps the reigning king; losing levels on death moves it back', () => {
    const w = makeWorld({ players: 3, rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 5, 5)
    put(w, 2, 9, 9)
    put(w, 3, 15, 15)
    drop(w, 5, 5, K.FirePlus)
    const f0 = step(w)
    expect(evs(f0, 'HatKingChanged')).toMatchObject([{ PreviousHatKingNetEntityIdRaw: 0, NewHatKingNetEntityIdRaw: 1 }])
    expect(f0.snapshot.BomberMatchState.HatKingNetEntityIdRaw).toBe(1)
    drop(w, 9, 9, K.SpeedPlus)
    const f1 = step(w)
    expect(hats(w, 2)).toBe(1)
    expect(evs(f1, 'HatKingChanged')).toHaveLength(0)
    drop(w, 9, 9, K.BombPlus)
    const f2 = step(w)
    expect(evs(f2, 'HatKingChanged')).toMatchObject([{ PreviousHatKingNetEntityIdRaw: 1, NewHatKingNetEntityIdRaw: 2 }])
    player(w, 2).health = 2
    addBomb(w, 3, 9, 11, 1)
    step(w)
    const f4 = step(w)
    expect(hats(w, 2)).toBe(0)
    expect(evs(f4, 'HatKingChanged')).toMatchObject([{ PreviousHatKingNetEntityIdRaw: 2, NewHatKingNetEntityIdRaw: 1 }])
  })

  it('no power-ups anywhere → no hat king', () => {
    const w = makeWorld({ players: 3 })
    const frames = run(w, 5)
    expect(evs(frames, 'HatKingChanged')).toHaveLength(0)
    expect(w.match.hatKing).toBe(0)
  })

  it('a leaving player drops every power-up as pickups (anyone can take them) and the crown moves on', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 15, 15)
    put(w, 2, 9, 9)
    put(w, 3, 1, 1)
    giveLevels(w, 2, 1, 1, 1)
    giveLevels(w, 3, 1, 0, 0)
    step(w)
    expect(w.match.hatKing).toBe(2)
    w.out = []
    expect(removePlayerFromWorld(w, 2)).toBe(true)
    expect(w.players.map((p) => p.id)).toEqual([1, 3])
    expect(w.match.hatKing).toBe(3)
    const f = step(w)
    expect(evs(f, 'PowerupsDropped')).toMatchObject([{ VictimNetEntityIdRaw: 2, Kinds: [K.FirePlus, K.BombPlus, K.SpeedPlus], Cell: { X: 9, Y: 9 } }])
    const sp = evs(f, 'PickupSpawned')
    expect(sp.map((e) => [e.Source, e.DroppedByNetEntityIdRaw])).toEqual([
      ['death', 2],
      ['death', 2],
      ['death', 2],
    ])
    expect(f.snapshot.Pickups.filter((p) => p.droppedBy === 2)).toHaveLength(3)
    expect(evs(f, 'HatKingChanged')).toMatchObject([{ PreviousHatKingNetEntityIdRaw: 2, NewHatKingNetEntityIdRaw: 3 }])
    noHatResourceEvents(f)
    expect(removePlayerFromWorld(w, 2)).toBe(false)
  })
})
