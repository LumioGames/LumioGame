import { describe, expect, it } from 'vitest'
import { BlockType, DeathCause } from '../../contract'
import { addBomb, BOMB, evs, giveLevels, hats, makeWorld, mv, player, put, run, setGround, step } from './helpers'
import { 方向 } from '../../contract'

/** 设计 §7 第 2、3、7、8 项（矩阵 1.9 / 2.x / 3.1–3.8）。 */
describe('same-bomb hit memory and danger window', () => {
  it('a bomb hits a player once, even when leaving and re-entering during the window (2.1)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 1, 1)
    const b = addBomb(w, 1, 3, 1, 1)
    const f0 = step(w)
    const d0 = evs(f0, 'DamageApplied')
    expect(d0).toHaveLength(1)
    expect(d0[0]).toMatchObject({ VictimNetEntityIdRaw: 2, SourceBombNetEntityIdRaw: b.id, SourceBombOwnerNetEntityIdRaw: 1, ChainId: b.id, HealthPointsLeft: 4 })
    put(w, 2, 1, 5)
    const f1 = run(w, 2)
    put(w, 2, 1, 1)
    const f2 = run(w, 10)
    expect(evs([...f1, ...f2], 'DamageApplied')).toHaveLength(0)
    expect(w.bombs).toHaveLength(0)
  })

  it('entering at DangerUntilTick−1 is a hit, at DangerUntilTick is not (1.9)', () => {
    for (const lateBy of [0, 1]) {
      const w = makeWorld()
      put(w, 1, 15, 15)
      put(w, 2, 1, 5)
      const b = addBomb(w, 1, 3, 1, 1)
      step(w)
      const enterTick = b.dangerUntilTick - 1 + lateBy
      while (w.t < enterTick - 1) step(w)
      put(w, 2, 1, 1)
      const f = step(w)
      expect(f.snapshot.Tick).toBe(enterTick)
      expect(evs(f, 'DamageApplied')).toHaveLength(lateBy === 0 ? 1 : 0)
    }
  })
})

describe('chain damage cap and settlement order', () => {
  it('three chained bombs take 6→4→2→0, the third is the kill; the fourth adds nothing (2.2, 2.3, 2.5)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 5, 1)
    const a = addBomb(w, 1, 3, 1, 1)
    addBomb(w, 1, 5, 1, 40)
    addBomb(w, 1, 7, 1, 40)
    addBomb(w, 1, 5, 3, 40)
    const f = step(w)
    expect(evs(f, 'BombExploded')).toHaveLength(4)
    const dmg = evs(f, 'DamageApplied')
    expect(dmg.map((d) => d.HealthPointsLeft)).toEqual([4, 2, 0])
    expect(new Set(dmg.map((d) => d.SourceBombNetEntityIdRaw)).size).toBe(3)
    expect(dmg.every((d) => d.ChainId === a.id)).toBe(true)
    const died = evs(f, 'PlayerDied')
    expect(died).toHaveLength(1)
    expect(died[0]).toMatchObject({ VictimNetEntityIdRaw: 2, KillerNetEntityIdRaw: 1, ChainId: a.id, Cause: DeathCause.Bomb, Tick: f.snapshot.Tick })
    expect(died[0].proto?.SourceBombNetEntityIdRaw).toBe(dmg[2].SourceBombNetEntityIdRaw)
  })

  it('a later effect on a target already at ≤ 0 is Rejected: two chains, one kill (2.3)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 1, 1).health = 2
    addBomb(w, 1, 3, 1, 1)
    addBomb(w, 1, 1, 3, 1)
    const f = step(w)
    expect(evs(f, 'ChainResolved')).toHaveLength(2)
    expect(evs(f, 'DamageApplied')).toHaveLength(1)
    expect(evs(f, 'PlayerDied')).toHaveLength(1)
  })

  it('two bombs of the same owner in the same tick → two DamageApplied with different source bombs (2.4, 2.6)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    put(w, 2, 1, 1)
    const a = addBomb(w, 1, 3, 1, 1)
    const b = addBomb(w, 1, 1, 3, 1)
    const dmg = evs(step(w), 'DamageApplied')
    expect(dmg.map((d) => d.SourceBombNetEntityIdRaw)).toEqual([a.id, b.id])
    expect(dmg.map((d) => d.SourceBombOwnerNetEntityIdRaw)).toEqual([1, 1])
    expect(dmg.map((d) => d.HealthPointsLeft)).toEqual([4, 2])
  })
})

describe('death, respawn and protection', () => {
  it('death is processed one tick late; RespawnAtTick = death tick + respawn; full health + protection (3.1, 3.3, 3.4)', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 15, 15)
    const v = put(w, 2, 1, 1)
    giveLevels(w, 2, 1, 1, 1)
    v.health = 2
    addBomb(w, 1, 3, 1, 1)
    const fd = step(w)
    const T = fd.snapshot.Tick
    expect(evs(fd, 'PlayerDied')[0]).toMatchObject({ Tick: T, Cell: { X: 1, Y: 1 }, proto: { HatsLost: 3 } })
    // 死亡帧：强化（帽子）还在身上，尚未掉落。
    expect(fd.snapshot.Players[1].BomberPlayerState.HatCount).toBe(3)
    expect(evs(fd, 'PowerupsDropped')).toHaveLength(0)

    const f1 = step(w)
    expect(evs(f1, 'PowerupsDropped')[0].Kinds).toHaveLength(3)
    expect(f1.snapshot.Players[1].BomberPlayerState).toMatchObject({ HatCount: 0, RespawnAtTick: T + w.ticks.respawn })
    // 击杀不铸帽（ADR 0028）。
    expect(f1.snapshot.Players[0].BomberPlayerState.HatCount).toBe(0)
    expect(evs(f1, 'HatMinted')).toHaveLength(0)

    // 死人不能动也不能放弹。
    const f2 = step(w, { 2: [mv(方向.右), BOMB] })
    expect(evs(f2, 'BombPlaced')).toHaveLength(0)

    let respawned = evs(f2, 'PlayerRespawned')
    while (respawned.length === 0 && w.t < T + w.ticks.respawn + 5) respawned = evs(step(w), 'PlayerRespawned')
    expect(respawned).toHaveLength(1)
    expect(respawned[0].Tick).toBe(T + w.ticks.respawn)
    const p = player(w, 2)
    expect(p.health).toBe(w.cfg.maxHealthPoints)
    expect(p.protectedUntilTick).toBe(T + w.ticks.respawn + w.ticks.protection)
    expect(p.teleportTick).toBe(T + w.ticks.respawn)
    expect(p.mx % 1000).toBe(500)
    expect(p.my % 1000).toBe(500)
  })

  it('a self-kill has Killer == Victim and mints nothing (3.2, 4.1)', () => {
    const w = makeWorld()
    put(w, 2, 15, 15)
    put(w, 1, 1, 1).health = 2
    addBomb(w, 1, 3, 1, 1)
    const f = step(w)
    expect(evs(f, 'PlayerDied')[0]).toMatchObject({ VictimNetEntityIdRaw: 1, KillerNetEntityIdRaw: 1, Cause: DeathCause.Bomb })
    const f1 = step(w)
    expect(evs([f, f1], 'HatMinted')).toHaveLength(0)
    expect(hats(w, 1) + hats(w, 2)).toBe(0)
  })

  it('protected players take no damage; placing a bomb ends protection (3.5)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const p = put(w, 2, 9, 9)
    p.protectedUntilTick = w.t + 100
    addBomb(w, 1, 9, 9, 1)
    const f0 = run(w, 10)
    expect(evs(f0, 'DamageApplied')).toHaveLength(0)
    const f1 = step(w, { 2: [BOMB] })
    expect(evs(f1, 'BombPlaced')).toHaveLength(1)
    expect(p.protectedUntilTick).toBe(f1.snapshot.Tick)
    addBomb(w, 1, 10, 9, 1)
    const f2 = step(w)
    expect(evs(f2, 'DamageApplied').filter((d) => d.VictimNetEntityIdRaw === 2).length).toBeGreaterThan(0)
  })
})

describe('drowning', () => {
  it('6 s in water from full health → death with Cause 1, Killer == Victim, no hat minted; power-ups drop on land (3.6, 3.7)', () => {
    const w = makeWorld({ rules: { deathPowerupDropPermille: 1000 } })
    put(w, 1, 15, 15)
    setGround(w, 3, 3, BlockType.水)
    put(w, 2, 3, 3)
    giveLevels(w, 2, 1, 1, 0)
    const first = w.t + 1
    const frames = []
    let died = false
    while (!died && w.t < first + 200) {
      const f = step(w)
      frames.push(f)
      died = evs(f, 'PlayerDied').length > 0
    }
    const dmg = evs(frames, 'DamageApplied')
    expect(dmg).toHaveLength(6)
    expect(dmg.map((d) => d.Tick - first + 1)).toEqual([20, 40, 60, 80, 100, 120])
    expect(dmg.every((d) => d.proto?.Cause === DeathCause.Drown && d.SourceBombNetEntityIdRaw === 0 && d.ChainId === 0)).toBe(true)
    const death = evs(frames, 'PlayerDied')[0]
    expect(death).toMatchObject({ VictimNetEntityIdRaw: 2, KillerNetEntityIdRaw: 2, Cause: DeathCause.Drown, ChainId: 0 })
    expect(death.Tick - first + 1).toBe(120)
    const after = step(w)
    expect(evs(after, 'HatMinted')).toHaveLength(0)
    const sp = evs(after, 'PickupSpawned').filter((e) => e.Source === 'death')
    expect(sp).toHaveLength(2)
    expect(sp.every((e) => !(e.Cell.X === 3 && e.Cell.Y === 3))).toBe(true)
    expect(hats(w, 2)).toBe(0)
  })

  it('leaving water stops drowning; lost health does not come back (3.8)', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    setGround(w, 3, 3, BlockType.水)
    const p = put(w, 2, 3, 3)
    run(w, 25)
    expect(p.health).toBe(5)
    put(w, 2, 5, 5)
    const f = run(w, 100)
    expect(evs(f, 'DamageApplied')).toHaveLength(0)
    expect(p.health).toBe(5)
  })

  it('water slows movement to 70% and swallows a placed bomb without spending capacity', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    setGround(w, 3, 3, BlockType.水)
    const p = put(w, 2, 3, 3)
    p.protectedUntilTick = w.t + 1000
    const f = step(w, { 2: [mv(方向.右, true), BOMB] })
    expect(p.mx).toBe(3500 + Math.floor((3500 * 700) / 1000 / 20))
    expect(evs(f, 'BombExtinguished')).toMatchObject([{ OwnerNetEntityIdRaw: 2, Cell: { X: 3, Y: 3 } }])
    expect(evs(f, 'BombPlaced')).toHaveLength(0)
    expect(w.bombs).toHaveLength(0)
    expect(p.capacity).toBe(1)
    expect(p.protectedUntilTick).toBe(f.snapshot.Tick)
  })
})
