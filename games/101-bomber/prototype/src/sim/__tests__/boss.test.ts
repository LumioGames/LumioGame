import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  DeathCause,
  PickupKind,
  isBoss,
  maxHealthCeiling,
  maxHealthFor,
  poisonPointsFor,
  type PlayerView,
} from '../../contract'
import { hatCountOf, maxHealthOf } from '../death-drops'
import { ringRect } from '../final-circle'
import { removePlayerFromWorld } from '../hats'
import { stepWorld } from '../step'
import { cellOccupied, isAlive, makeBomb, makePickup, newId, playerCell, type World } from '../world'
import { addBomb, cell, evs, giveLevels, hats, makeWorld, player, put, run, startCircle, step, Walker } from './helpers'

/**
 * 成长与 Boss（原型扩展 NON-CONTRACT，ADR 0039，design §8.5 / §9 / §12）：每人心数上限 = 6 + 2·min(2, ⌊帽数/4⌋) +
 * 2·min(3, 金心数) 半心点（3–8 心）；跨阈值的新心是满的、存活期间只升不降；同链伤害上限、血包、回春、重生都按当前上限；
 * 金心不算帽子、死亡全掉（落地 3 秒防爆）；毒圈每跳 ⌈段点数 × 上限 / 6⌉，任何上限下满血约 6 / 3 秒毒死。
 */

function drop(w: World, x: number, y: number, kind: PickupKind, droppedBy = 0) {
  const it = makePickup({ id: newId(w), cell: cell(w, x, y), kind, bornTick: w.t, droppedBy })
  w.pickups.push(it)
  return it
}

function viewOf(f: { snapshot: { Players: readonly PlayerView[] } }, id: number): PlayerView {
  const p = f.snapshot.Players.find((q) => q.NetEntityIdRaw === id)
  if (!p) throw new Error(`no view ${id}`)
  return p
}

describe('max health: 6 + 2·min(2, ⌊hats/4⌋) + 2·min(3, gold)', () => {
  it('pure: hats 0 / 4 / 8 / 12 → 6 / 8 / 10 / 10 points (3 / 7 hats stay below the next threshold)', () => {
    expect([0, 4, 8, 12].map((h) => maxHealthFor(DEFAULT_CONFIG, DEFAULT_RULES, h, 0))).toEqual([6, 8, 10, 10])
    expect([3, 7].map((h) => maxHealthFor(DEFAULT_CONFIG, DEFAULT_RULES, h, 0))).toEqual([6, 8])
  })

  it('pure: gold hearts 0–3 stack on top of the hat hearts up to 16 points (8 hearts); a 4th adds nothing', () => {
    expect([0, 1, 2, 3, 4].map((g) => maxHealthFor(DEFAULT_CONFIG, DEFAULT_RULES, 8, g))).toEqual([10, 12, 14, 16, 16])
    expect([0, 1, 2, 3].map((g) => maxHealthFor(DEFAULT_CONFIG, DEFAULT_RULES, 0, g))).toEqual([6, 8, 10, 12])
    expect(maxHealthCeiling(DEFAULT_CONFIG, DEFAULT_RULES)).toBe(16)
  })

  it('Boss = max ≥ 6 hearts (12 points)', () => {
    expect([6, 10, 12, 16].map((m) => isBoss(DEFAULT_CONFIG, DEFAULT_RULES, m))).toEqual([false, false, true, true])
  })

  it('in the world: derived from the hat count (hats 0 / 4 / 8 / 12) and goldHearts; gold hearts are not hats', () => {
    const w = makeWorld()
    const p = player(w, 1)
    const at = (fire: number, bomb: number, speed: number, gold: number): [number, number] => {
      giveLevels(w, 1, fire, bomb, speed)
      p.goldHearts = gold
      return [hatCountOf(w, p), maxHealthOf(w, p)]
    }
    expect(at(0, 0, 0, 0)).toEqual([0, 6])
    expect(at(2, 2, 0, 0)).toEqual([4, 8])
    expect(at(4, 4, 0, 0)).toEqual([8, 10])
    expect(at(4, 4, 4, 0)).toEqual([12, 10])
    expect(at(0, 0, 0, 3)).toEqual([0, 12])
    expect(at(4, 4, 4, 3)).toEqual([12, 16])
  })
})

describe('crossing a threshold: the new heart arrives full', () => {
  it('the 4th hat: cap 6 → 8 and current health +2, PlayerHealed { Source: boss } after PickupTaken', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    put(w, 2, 15, 15)
    giveLevels(w, 1, 3, 0, 0)
    expect(p.health).toBe(6)
    drop(w, 3, 3, PickupKind.BombPlus)
    const f = step(w)
    expect(hats(w, 1)).toBe(4)
    expect(p.health).toBe(8)
    const order = f.events.filter((e) => e.type === 'PickupTaken' || e.type === 'PlayerHealed').map((e) => e.type)
    expect(order).toEqual(['PickupTaken', 'PlayerHealed'])
    expect(evs(f, 'PlayerHealed')).toEqual([
      { type: 'PlayerHealed', presentationOnly: true, NetEntityIdRaw: 1, Points: 2, HealthPointsLeft: 8, Source: 'boss', Tick: f.snapshot.Tick },
    ])
    expect(viewOf(f, 1)).toMatchObject({ maxHealth: 8, goldHearts: 0, frenzyUntilTick: 0 })
  })

  it('a hurt player keeps the missing points: 3 / 6 → 5 / 8; a pickup below the threshold heals nothing', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    put(w, 2, 15, 15)
    giveLevels(w, 1, 2, 0, 0)
    p.health = 3
    drop(w, 3, 3, PickupKind.FirePlus)
    const f1 = step(w)
    expect([hats(w, 1), p.health, maxHealthOf(w, p)]).toEqual([3, 3, 6])
    expect(evs(f1, 'PlayerHealed')).toHaveLength(0)
    drop(w, 3, 3, PickupKind.SpeedPlus)
    step(w)
    expect([hats(w, 1), p.health, maxHealthOf(w, p)]).toEqual([4, 5, 8])
  })

  it('health pack: fills up to the current cap (a 4-heart player at 6 / 8 takes it), not past it', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    put(w, 2, 15, 15)
    giveLevels(w, 1, 4, 0, 0)
    p.health = 6
    const pack = drop(w, 3, 3, PickupKind.HealthPack)
    step(w)
    expect(w.pickups.some((q) => q.id === pack.id)).toBe(false)
    expect(p.health).toBe(8)
    const pack2 = drop(w, 3, 3, PickupKind.HealthPack)
    step(w)
    expect(w.pickups.some((q) => q.id === pack2.id)).toBe(true)
    expect(p.health).toBe(8)
  })
})

describe('gold hearts', () => {
  it('pickup: goldHearts + 1, cap and health + 2, PlayerHealed boss; not a hat; a 4th is left on the ground', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    put(w, 2, 15, 15)
    for (let i = 1; i <= 3; i++) {
      drop(w, 3, 3, PickupKind.GoldHeart)
      const f = step(w)
      expect(evs(f, 'PickupTaken').map((e) => e.Kind)).toEqual([PickupKind.GoldHeart])
      expect(evs(f, 'PlayerHealed')).toMatchObject([{ NetEntityIdRaw: 1, Points: 2, HealthPointsLeft: 6 + 2 * i, Source: 'boss' }])
      expect([p.goldHearts, p.health, maxHealthOf(w, p), hats(w, 1)]).toEqual([i, 6 + 2 * i, 6 + 2 * i, 0])
      expect(viewOf(f, 1)).toMatchObject({ goldHearts: i, maxHealth: 6 + 2 * i, BomberPlayerState: { HatCount: 0 } })
    }
    const fourth = drop(w, 3, 3, PickupKind.GoldHeart)
    const f = step(w)
    expect(evs(f, 'PickupTaken')).toHaveLength(0)
    expect(w.pickups.some((q) => q.id === fourth.id)).toBe(true)
    expect(p.goldHearts).toBe(3)
  })

  it('death drops every gold heart (Source death, droppedBy victim), they are protected for 3 s, hats are untouched', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const v = put(w, 2, 5, 1)
    v.goldHearts = 3
    v.health = 2
    expect(hats(w, 2)).toBe(0)
    addBomb(w, 1, 3, 1, 1)
    const f0 = step(w)
    expect(evs(f0, 'PlayerDied')).toMatchObject([{ VictimNetEntityIdRaw: 2, Cause: DeathCause.Bomb }])
    expect(evs(f0, 'PlayerDied')[0].proto?.HatsLost).toBe(0)
    const f1 = step(w)
    const spawned = evs(f1, 'PickupSpawned').filter((e) => e.Kind === PickupKind.GoldHeart)
    expect(spawned).toHaveLength(3)
    expect(spawned.every((e) => e.Source === 'death' && e.DroppedByNetEntityIdRaw === 2)).toBe(true)
    expect(evs(f1, 'PowerupsDropped')).toHaveLength(0)
    expect(v.goldHearts).toBe(0)
    const views = f1.snapshot.Pickups.filter((q) => q.BomberPickupItem.Kind === PickupKind.GoldHeart)
    expect(views.every((q) => q.protectedUntilTick === f1.snapshot.Tick + w.ticks.deathDropProtect)).toBe(true)
    // 3 秒内：罩住全部金心的爆炸炸不毁它们。
    const ids = new Set(views.map((q) => q.NetEntityIdRaw))
    for (const q of w.pickups.filter((it) => ids.has(it.id))) {
      const c = q.cell
      w.bombs.push(makeBomb({ id: newId(w), owner: 1, cell: c, bornTick: w.t, fuseEndTick: w.t + 1, power: 1 }))
    }
    const blast = run(w, 3)
    expect(evs(blast, 'BombExploded').length).toBeGreaterThanOrEqual(3)
    expect(evs(blast, 'PickupDestroyed').filter((e) => ids.has(e.PickupNetEntityIdRaw))).toHaveLength(0)
    expect(w.pickups.filter((q) => ids.has(q.id))).toHaveLength(3)
  })

  it('elimination in the final circle and leaving mid-match also drop every gold heart', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 3, 11, 11)
    const v = put(w, 2, 5, 1)
    v.goldHearts = 2
    v.health = 2
    startCircle(w)
    addBomb(w, 1, 3, 1, 1)
    step(w)
    const f = step(w)
    expect(v.eliminated).toBe(true)
    expect(evs(f, 'PickupSpawned').filter((e) => e.Kind === PickupKind.GoldHeart && e.Source === 'death')).toHaveLength(2)
    expect(v.goldHearts).toBe(0)

    const w2 = makeWorld()
    const q = put(w2, 2, 7, 7)
    q.goldHearts = 3
    removePlayerFromWorld(w2, 2)
    expect(w2.out.filter((e) => e.type === 'PickupSpawned' && e.Kind === PickupKind.GoldHeart)).toHaveLength(3)
  })
})

describe('everything that used the fixed cap now reads the per-player cap', () => {
  it('chain cap = victim cap: a 5-heart victim (10) survives four chained bombs with 2 left', () => {
    const w = makeWorld()
    put(w, 1, 15, 15)
    const v = put(w, 2, 5, 1)
    giveLevels(w, 2, 4, 4, 0)
    v.health = maxHealthOf(w, v)
    expect(v.health).toBe(10)
    addBomb(w, 1, 3, 1, 1)
    addBomb(w, 1, 5, 1, 40)
    addBomb(w, 1, 7, 1, 40)
    addBomb(w, 1, 5, 3, 40)
    const f = step(w)
    expect(evs(f, 'BombExploded')).toHaveLength(4)
    expect(evs(f, 'DamageApplied').map((d) => d.HealthPointsLeft)).toEqual([8, 6, 4, 2])
    expect(evs(f, 'PlayerDied')).toHaveLength(0)
  })

  it('respawn is full at the current cap', () => {
    const w = makeWorld()
    const p = put(w, 1, 3, 3)
    put(w, 2, 15, 15)
    p.health = 0
    p.awaitingRespawn = true
    p.respawnAtTick = w.t + 1
    giveLevels(w, 1, 2, 2, 0)
    p.goldHearts = 1
    step(w)
    expect(p.awaitingRespawn).toBe(false)
    expect(p.health).toBe(10)
  })

  it('regen heals up to the current cap', () => {
    const w = makeWorld({ picks: ['rabbit', null] })
    const r = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    expect(r.slots.passive?.skill).toBe('regen')
    giveLevels(w, 1, 4, 0, 0)
    r.health = 6
    const N = w.ticks.skills.regen[0].interval
    const P = w.rules.skills.regen.levels[0].points
    const heals = evs(run(w, N * Math.ceil(2 / P) + 1), 'PlayerHealed').filter((e) => e.Source === 'regen')
    expect(heals.length).toBeGreaterThan(0)
    expect(r.health).toBe(8)
  })
})

describe('poison scales with the cap: ⌈stagePoints × cap / 6⌉ every second', () => {
  it('pure: 3-heart 1 / 2 unchanged; 4 hearts 2 / 3; 8 hearts 3 / 6', () => {
    expect([6, 8, 16].map((m) => [poisonPointsFor(DEFAULT_CONFIG, 1, m), poisonPointsFor(DEFAULT_CONFIG, 2, m)])).toEqual([
      [1, 2],
      [2, 3],
      [3, 6],
    ])
  })

  const hits = (stageIndex: number, side: number, boss: boolean) => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 9, 9)
    put(w, 3, 9, 10)
    const v = put(w, 2, 1, 1)
    if (boss) {
      giveLevels(w, 2, 4, 4, 0)
      v.goldHearts = 3
      v.health = maxHealthOf(w, v)
    }
    startCircle(w)
    w.finalCircle!.ring = ringRect(w.size, side)
    w.finalCircle!.stageIndex = stageIndex
    const first = w.t + 1
    const frames = run(w, 200)
    return {
      start: boss ? 16 : 6,
      dmg: evs(frames, 'DamageApplied')
        .filter((d) => d.VictimNetEntityIdRaw === 2)
        .map((d) => ({ tick: d.Tick - first + 1, points: d.proto!.Points, left: d.HealthPointsLeft })),
      died: evs(frames, 'PlayerDied').filter((d) => d.VictimNetEntityIdRaw === 2).map((d) => ({ tick: d.Tick - first + 1, cause: d.Cause })),
      tps: w.ticks.poison,
    }
  }

  it('3-heart player: −1 point per second before the 5×5, −2 from the 5×5 (unchanged)', () => {
    const a = hits(2, 7, false)
    expect(a.dmg.slice(0, 3)).toEqual([
      { tick: 20, points: 1, left: 5 },
      { tick: 40, points: 1, left: 4 },
      { tick: 60, points: 1, left: 3 },
    ])
    const b = hits(3, 5, false)
    expect(b.dmg).toEqual([
      { tick: 20, points: 2, left: 4 },
      { tick: 40, points: 2, left: 2 },
      { tick: 60, points: 2, left: 0 },
    ])
  })

  it('8-heart Boss outside the ring dies within 6 s before the 5×5 and within 3 s from the 5×5', () => {
    const a = hits(2, 7, true)
    expect(a.dmg.every((d) => d.points === 3)).toBe(true)
    expect(a.died).toHaveLength(1)
    expect(a.died[0].cause).toBe(DeathCause.Poison)
    expect(a.died[0].tick).toBeLessThanOrEqual(6 * a.tps)
    const b = hits(3, 5, true)
    expect(b.dmg.every((d) => d.points === 6)).toBe(true)
    expect(b.died).toHaveLength(1)
    expect(b.died[0].tick).toBeLessThanOrEqual(3 * b.tps)
  })
})

describe('the cap never drops while alive (200-tick random match)', () => {
  it('random walkers + bombs + pickups at their feet: per-player cap is monotonic while alive, health ≤ cap', () => {
    const w = makeWorld({ players: 8, clear: false, seed: 7 })
    const walker = new Walker(20260928, 0.06)
    const ids = w.players.map((p) => p.id)
    const kinds = [PickupKind.FirePlus, PickupKind.BombPlus, PickupKind.SpeedPlus, PickupKind.GoldHeart]
    const last = new Map<number, number>()
    let grew = 0
    let deaths = 0
    for (let t = 0; t < 200; t++) {
      if (t % 5 === 0)
        w.players.forEach((p, i) => {
          if (!isAlive(p)) return
          const c = playerCell(w, p)
          if (w.brick[c] !== 0 || cellOccupied(w, c)) return
          w.pickups.push(makePickup({ id: newId(w), cell: c, kind: kinds[(t / 5 + i) % kinds.length], bornTick: w.t, droppedBy: 0 }))
        })
      const f = stepWorld(w, walker.inputs(ids))
      deaths += evs(f, 'PlayerDied').length
      for (const p of w.players) {
        const cap = maxHealthOf(w, p)
        expect(viewOf(f, p.id).maxHealth).toBe(cap)
        if (!isAlive(p) || p.awaitingRespawn) {
          last.delete(p.id)
          continue
        }
        expect(p.health).toBeLessThanOrEqual(cap)
        const prev = last.get(p.id)
        if (prev !== undefined) {
          expect(cap).toBeGreaterThanOrEqual(prev)
          if (cap > prev) grew++
        }
        last.set(p.id, cap)
      }
    }
    // 非空断言：确实有人跨过阈值 / 吃到金心（上限真的涨过），也确实有人死过（死亡回落不算违例）。
    expect(grew).toBeGreaterThan(0)
    expect(deaths).toBeGreaterThan(0)
  })
})
