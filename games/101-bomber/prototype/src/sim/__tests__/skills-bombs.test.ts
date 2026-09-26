import { describe, expect, it } from 'vitest'
import { BlockType, BombKind, DeathCause, PickupKind, 方向, type BomberConfig, type ProtoRules } from '../../contract'
import { PIERCE_BOMB, PIERCE_CASES, parsePierceBoard, referenceCross } from '../../../tests/support/pierce-cases'
import { computeDangerCells, crossCells } from '../explosion'
import { createPickup } from '../pickup'
import { addBomb, BOMB, cell, evs, makeWorld, mv, player, put, run, setBrick, setGround, SKILL, step } from './helpers'
import { addSkillBomb, giveSkill, putChest } from './skill-helpers'

/**
 * 炸弹槽技能（原型扩展 NON-CONTRACT，ADR 0030，design §8.4）：冰冻弹（Q1：照常扣血再冻住幸存者）、穿透弹（唯一口径，
 * contract/skills.ts 文件头 + tests/support/pierce-cases.ts）、冰川弹；crossCells 与真实爆炸同步。
 * 中毒弹 / 麻痹弹（ADR 0033）：照常扣血，再让幸存者中毒（每秒 −1 点、可致死、记投弹者）/ 麻痹（移速 300‰）。
 */

const FREEZE = (freezeTicks = 16) => ({ kind: BombKind.Freeze, freezeTicks })

function freezeWorld(rules = {}) {
  const w = makeWorld({ players: 3, rules })
  put(w, 1, 1, 1)
  const v = put(w, 2, 5, 3)
  put(w, 3, 17, 17)
  return { w, v }
}

describe('freeze bomb', () => {
  it('BOMB with freezeBomb L1 in the bomb slot places a Freeze bomb with 16 freeze ticks; the snapshot shows it', () => {
    const w = makeWorld()
    put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    giveSkill(w, 1, 'freezeBomb', 1)
    const f = step(w, { 1: [BOMB] })
    expect(w.bombs[0]).toMatchObject({ kind: BombKind.Freeze, freezeTicks: 16, pierceLayers: 0 })
    expect(f.snapshot.Bombs[0].BomberBombState).toMatchObject({ BombKind: BombKind.Freeze, PierceLayers: 0 })
    giveSkill(w, 1, 'freezeBomb', 3)
    expect(w.ticks.skills.freezeBomb[2].freeze).toBe(24)
  })

  it('damages, then freezes the survivor: inputs of T+1..T+16 ignored, moves again at T+17', () => {
    const { w, v } = freezeWorld()
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    const f = step(w)
    const T = w.t
    expect(evs(f, 'DamageApplied')).toMatchObject([{ VictimNetEntityIdRaw: 2, proto: { Points: 2 } }])
    expect(evs(f, 'PlayerFrozen')).toEqual([
      { type: 'PlayerFrozen', presentationOnly: true, VictimNetEntityIdRaw: 2, SourceBombNetEntityIdRaw: w.bombs[0].id, SourceBombOwnerNetEntityIdRaw: 1, UntilTick: T + 17, Tick: T },
    ])
    expect(v.frozenUntilTick).toBe(T + 17)
    expect(v.freezeImmuneUntilTick).toBe(T + 17 + 20)
    for (let i = 1; i <= 16; i++) {
      const g = step(w, { 2: [mv(方向.右), BOMB, SKILL] })
      expect(evs(g, 'BombPlaced')).toHaveLength(0)
      expect(evs(g, 'SkillFailed')).toMatchObject([{ Reason: 'frozen' }])
    }
    expect(v.mx).toBe(5500)
    expect(w.t).toBe(T + 16)
    step(w, { 2: [mv(方向.右)] })
    expect(v.mx).toBeGreaterThan(5500)
  })

  it('freezeBombDamages = false: freezes without damage (design §8.4 wording)', () => {
    const { w, v } = freezeWorld({ freezeBombDamages: false })
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    const f = step(w)
    expect(evs(f, 'DamageApplied')).toHaveLength(0)
    expect(evs(f, 'PlayerFrozen')).toHaveLength(1)
    expect(v.health).toBe(w.cfg.maxHealthPoints)
  })

  it('a killing freeze bomb freezes nobody (survivors only)', () => {
    const { w, v } = freezeWorld()
    v.health = 2
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    const f = step(w)
    expect(evs(f, 'PlayerDied')).toHaveLength(1)
    expect(evs(f, 'PlayerFrozen')).toHaveLength(0)
    expect(v.frozenUntilTick).toBe(0)
  })

  it('no stacking or refresh while frozen; immune until until + 20 after it ends', () => {
    const { w, v } = freezeWorld({ freezeBombDamages: false })
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    step(w)
    const until = v.frozenUntilTick
    addSkillBomb(w, 1, 3, 3, 1, 2, FREEZE(24))
    step(w)
    expect(v.frozenUntilTick).toBe(until)
    while (w.t < until + 5) step(w)
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    expect(evs(step(w), 'PlayerFrozen')).toHaveLength(0)
    expect(v.frozenUntilTick).toBe(until)
    while (w.t < until + 20) step(w)
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    expect(evs(step(w), 'PlayerFrozen')).toHaveLength(1)
  })

  it('later damage ends the freeze and grants freezeImmune; same-tick damage does not', () => {
    const { w, v } = freezeWorld()
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    step(w)
    const T = w.t
    for (let i = 0; i < 4; i++) step(w)
    addBomb(w, 1, 3, 3, 1, 2)
    step(w)
    expect(w.t).toBe(T + 5)
    expect(v.frozenUntilTick).toBe(T + 5)
    expect(v.freezeImmuneUntilTick).toBe(T + 5 + 20)
    step(w, { 2: [mv(方向.右)] })
    expect(v.mx).toBeGreaterThan(5500)

    // 同一 Tick：标准弹 + 冰冻弹（不同链也一样）都在这一刻结算，冻结照样成立。
    const { w: w2, v: v2 } = freezeWorld()
    addBomb(w2, 1, 3, 3, 1, 2)
    addSkillBomb(w2, 1, 5, 5, 1, 2, FREEZE())
    const f = step(w2)
    expect(evs(f, 'DamageApplied').filter((e) => e.VictimNetEntityIdRaw === 2)).toHaveLength(2)
    expect(v2.frozenUntilTick).toBe(w2.t + 17)
  })

  it('protected players are not frozen; an armed turn buffer does not move a frozen player', () => {
    const { w, v } = freezeWorld()
    v.protectedUntilTick = w.t + 100
    addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE())
    expect(evs(step(w), 'PlayerFrozen')).toHaveLength(0)

    const { w: w2, v: v2 } = freezeWorld()
    // (3,3) 往右走进 (4,3)（离格心 −300，(4,4) 是铁皮柱拐不进去），提前按「下」：转角缓冲挂着、沿右接续。
    put(w2, 2, 3, 3)
    for (let i = 0; i < 4; i++) step(w2, { 2: [mv(方向.右)] })
    step(w2, { 2: [mv(方向.下, true)] })
    expect(v2.turnBuf).toBeGreaterThan(0)
    addSkillBomb(w2, 1, Math.floor(v2.mx / 1000), 3, 1, 2, FREEZE())
    step(w2)
    const x = v2.mx
    expect(v2.frozenUntilTick).toBeGreaterThan(w2.t)
    expect([v2.turnBuf, v2.pendingDir, v2.lastDir, v2.moveAcc]).toEqual([0, 方向.停, 方向.停, 0])
    for (let i = 0; i < 10; i++) step(w2)
    expect([v2.mx, v2.my]).toEqual([x, 3500])
  })

  it('breaks bricks and hits chests like any bomb', () => {
    const { w } = freezeWorld()
    setBrick(w, 7, 5, BlockType.积木)
    const chest = putChest(w, 5, 7)
    const f = (addSkillBomb(w, 1, 5, 5, 1, 2, FREEZE()), step(w))
    expect(evs(f, 'BrickDestroyed')).toMatchObject([{ Cell: { X: 7, Y: 5 } }])
    expect(chest.hitsLeft).toBe(w.rules.chestHitsRequired - 1)
  })
})

describe('pierce bomb', () => {
  function boardWorld(rows: readonly string[]) {
    const w = makeWorld()
    put(w, 1, 1, 17)
    put(w, 2, 17, 17)
    const board = parsePierceBoard(rows)
    const ox = 5
    const oy = 5
    for (let y = 0; y < board.size; y++)
      for (let x = 0; x < board.size; x++) {
        w.brick[cell(w, x + ox, y + oy)] = board.brick[y * board.size + x]
        w.ground[cell(w, x + ox, y + oy)] = board.ground[y * board.size + x]
      }
    for (const c of board.chests) putChest(w, (c % board.size) + ox, Math.floor(c / board.size) + oy)
    return { w, ox, oy }
  }

  it.each(PIERCE_CASES.map((c) => [c.name, c] as const))('shared fixture: %s', (_, c) => {
    const { w, ox, oy } = boardWorld(c.rows)
    const at = cell(w, PIERCE_BOMB.x + ox, PIERCE_BOMB.y + oy)
    const cross = crossCells(w, at, c.power, c.pierceLayers)
    const b = addSkillBomb(w, 1, PIERCE_BOMB.x + ox, PIERCE_BOMB.y + oy, 1, c.power, { kind: BombKind.Pierce, pierceLayers: c.pierceLayers })
    const f = step(w)
    const back = (i: number) => `${(i % w.size) - ox},${Math.floor(i / w.size) - oy}`
    const want = c.covered.map(([x, y]) => `${x},${y}`).sort()
    expect(b.covered.map(back).sort()).toEqual(want)
    expect(cross.map(back).sort()).toEqual(want)
    expect([b.reachUp, b.reachDown, b.reachLeft, b.reachRight]).toEqual(c.reach)
    expect(evs(f, 'BrickDestroyed').map((e) => `${e.Cell.X - ox},${e.Cell.Y - oy}`).sort()).toEqual(c.bricks.map(([x, y]) => `${x},${y}`).sort())
    expect(evs(f, 'ChestHit')).toHaveLength(c.chestsHit.length)
    expect(evs(f, 'BombExploded')[0].CellCount).toBe(c.covered.length)
    // 夹具自己的参考实现同口径。
    const ref = referenceCross(parsePierceBoard(c.rows), PIERCE_BOMB.x, PIERCE_BOMB.y, c.power, c.pierceLayers)
    expect(ref.reach).toEqual(c.reach)
  })

  it('pierce L1 / L2 / L3 from the bomb slot on a row of bricks', () => {
    for (const [level, destroyed, reach] of [
      [1, 2, 1],
      [2, 3, 2],
      [3, 3, 3],
    ] as const) {
      const w = makeWorld()
      put(w, 1, 1, 3)
      put(w, 2, 17, 17)
      giveSkill(w, 1, 'pierceBomb', level)
      for (const x of [2, 3, 4]) setBrick(w, x, 1, BlockType.积木)
      step(w, { 1: [BOMB] })
      const b = w.bombs[0]
      expect(b).toMatchObject({ kind: BombKind.Pierce, pierceLayers: [1, 2, 99][level - 1] })
      // 把弹挪到 (1,1)、火力 3、马上爆。
      put(w, 1, 1, 3)
      Object.assign(b, { cell: cell(w, 1, 1), power: 3, fuseEndTick: w.t + 1 })
      const f = step(w)
      expect(evs(f, 'BrickDestroyed'), `L${level}`).toHaveLength(destroyed)
      expect(b.reachRight, `L${level}`).toBe(reach)
      expect(b.covered).toContain(cell(w, 2, 1))
    }
  })

  it('crossCells agrees with the real explosion on 60 random boards (power 1–6, pierce 0–3)', () => {
    let s = 12345
    const rnd = (n: number) => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s % n
    }
    for (let k = 0; k < 60; k++) {
      const w = makeWorld({ clear: false, seed: 1 + (k % 12) })
      const air: number[] = []
      for (let c = 0; c < w.brick.length; c++) if (w.brick[c] === BlockType.Air && w.ground[c] !== BlockType.水) air.push(c)
      const at = air[rnd(air.length)]
      const power = 1 + rnd(6)
      const pierceLayers = rnd(4)
      w.bombs = []
      const expected = new Set(crossCells(w, at, power, pierceLayers))
      const b = addSkillBomb(w, 1, at % w.size, Math.floor(at / w.size), 1, power, { kind: BombKind.Pierce, pierceLayers })
      step(w)
      expect(new Set(b.covered), `case ${k}`).toEqual(expected)
    }
  })

  it('computeDangerCells marks the cell behind a brick for a pierce bomb inside the danger window', () => {
    const w = makeWorld()
    put(w, 1, 1, 17)
    put(w, 2, 17, 17)
    setBrick(w, 3, 1, BlockType.积木)
    addSkillBomb(w, 1, 1, 1, w.ticks.danger, 3, { kind: BombKind.Pierce, pierceLayers: 1 })
    const d = computeDangerCells(w)
    expect(d[cell(w, 3, 1)]).toBe(1)
    expect(d[cell(w, 4, 1)]).toBe(1)
    const w2 = makeWorld()
    put(w2, 1, 1, 17)
    put(w2, 2, 17, 17)
    setBrick(w2, 3, 1, BlockType.积木)
    addBomb(w2, 1, 1, 1, w2.ticks.danger, 3)
    expect(computeDangerCells(w2)[cell(w2, 4, 1)]).toBe(0)
  })

  it('water still stops a pierce arm after covering it', () => {
    const w = makeWorld()
    put(w, 1, 1, 17)
    put(w, 2, 17, 17)
    setGround(w, 3, 1, BlockType.水)
    const b = addSkillBomb(w, 1, 1, 1, 1, 5, { kind: BombKind.Pierce, pierceLayers: 99 })
    step(w)
    expect(b.reachRight).toBe(2)
  })
})

describe('glacier bomb', () => {
  it('freezes 20 ticks, pierces 1 layer, and (Q1) deals damage', () => {
    const w = makeWorld({ players: 3 })
    put(w, 1, 1, 17)
    const v = put(w, 2, 5, 1)
    put(w, 3, 17, 17)
    giveSkill(w, 1, 'glacierBomb', 1, false, [
      { skill: 'freezeBomb', level: 1, bound: false },
      { skill: 'pierceBomb', level: 1, bound: false },
    ])
    step(w, { 1: [BOMB] })
    const b = w.bombs[0]
    expect(b).toMatchObject({ kind: BombKind.Freeze, freezeTicks: 20, pierceLayers: 1 })
    setBrick(w, 3, 1, BlockType.积木)
    Object.assign(b, { cell: cell(w, 1, 1), power: 4, fuseEndTick: w.t + 1 })
    const f = step(w)
    expect(b.covered).toContain(cell(w, 3, 1))
    expect(evs(f, 'DamageApplied')).toMatchObject([{ VictimNetEntityIdRaw: 2 }])
    expect(evs(f, 'PlayerFrozen')).toMatchObject([{ VictimNetEntityIdRaw: 2, UntilTick: w.t + 21 }])
    expect(v.frozenUntilTick).toBe(w.t + 21)
    expect(player(w, 1).frozenUntilTick).toBe(0)
  })
})

// ---- 中毒弹 / 麻痹弹（原型扩展 NON-CONTRACT，ADR 0033）----

const TOXIN = (toxinTicks = 60) => ({ kind: BombKind.Toxin, toxinTicks })
const SHOCK = (shockTicks = 40, slowPermille = 300) => ({ kind: BombKind.Shock, shockTicks, slowPermille })

function statusWorld(opts: { rules?: Partial<ProtoRules>; cfg?: Partial<BomberConfig> } = {}) {
  const w = makeWorld({ players: 3, ...opts })
  put(w, 1, 1, 1)
  const v = put(w, 2, 5, 5)
  put(w, 3, 17, 17)
  return { w, v }
}

describe('toxin bomb', () => {
  it('BOMB with toxinBomb L1 / L3 places a Toxin bomb with 60 / 100 toxin ticks; the snapshot shows BombKind 5', () => {
    const w = makeWorld()
    put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    giveSkill(w, 1, 'toxinBomb', 1)
    const f = step(w, { 1: [BOMB] })
    expect(w.bombs[0]).toMatchObject({ kind: BombKind.Toxin, toxinTicks: 60, shockTicks: 0, freezeTicks: 0, pierceLayers: 0 })
    expect(f.snapshot.Bombs[0].BomberBombState.BombKind).toBe(5)
    expect(w.ticks.skills.toxinBomb.map((r) => r.duration)).toEqual([60, 80, 100])
  })

  it('damages 2 points, then poisons the survivor: −1 point every 20 ticks for 3 s, killer = thrower, then clears', () => {
    const { w, v } = statusWorld()
    const b = addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    const f = step(w)
    const T = w.t
    expect(evs(f, 'DamageApplied')).toMatchObject([{ VictimNetEntityIdRaw: 2, proto: { Points: 2, Cause: DeathCause.Bomb } }])
    expect(evs(f, 'PlayerPoisoned')).toEqual([
      { type: 'PlayerPoisoned', presentationOnly: true, VictimNetEntityIdRaw: 2, SourceBombNetEntityIdRaw: b.id, SourceBombOwnerNetEntityIdRaw: 1, UntilTick: T + 61, Tick: T },
    ])
    expect([v.toxinUntilTick, v.toxinOwner, v.toxinBomb, v.toxinNextTick]).toEqual([T + 61, 1, b.id, T + 20])
    expect(f.snapshot.Players.find((p) => p.NetEntityIdRaw === 2)?.skills?.toxinUntilTick).toBe(T + 61)
    const frames = run(w, 70)
    const toxic = evs(frames, 'DamageApplied')
    expect(toxic.map((e) => e.Tick)).toEqual([T + 20, T + 40, T + 60])
    for (const e of toxic)
      expect(e).toMatchObject({ VictimNetEntityIdRaw: 2, SourceBombNetEntityIdRaw: b.id, SourceBombOwnerNetEntityIdRaw: 1, ChainId: 0, proto: { Cause: DeathCause.Toxin, Points: 1 } })
    expect(v.health).toBe(6 - 2 - 3)
    expect([v.toxinUntilTick, v.toxinOwner, v.toxinBomb, v.toxinNextTick]).toEqual([0, 0, 0, 0])
    expect(frames[frames.length - 1].snapshot.Players.find((p) => p.NetEntityIdRaw === 2)?.skills?.toxinUntilTick).toBe(0)
  })

  it('is lethal: the poison tick that empties the hearts kills with Cause Toxin, credited to the thrower', () => {
    const { w, v } = statusWorld()
    v.health = 3
    const b = addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    step(w)
    const T = w.t
    const frames = run(w, 20)
    expect(evs(frames, 'PlayerDied')).toMatchObject([
      { VictimNetEntityIdRaw: 2, KillerNetEntityIdRaw: 1, Cause: DeathCause.Toxin, ChainId: 0, Tick: T + 20, proto: { SourceBombNetEntityIdRaw: b.id } },
    ])
    // 死亡结算（下一 Tick）清毒。
    step(w)
    expect([v.toxinUntilTick, v.toxinOwner, v.toxinNextTick]).toEqual([0, 0, 0])
  })

  it('a second hit refreshes the duration without stacking the rate; the kill credit moves to the latest thrower', () => {
    const { w, v } = statusWorld({ cfg: { maxHealthPoints: 20 } })
    addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    step(w)
    const T = w.t
    run(w, 29)
    const b2 = addSkillBomb(w, 3, 5, 3, 1, 2, TOXIN())
    const g = step(w)
    expect(w.t).toBe(T + 30)
    expect(evs(g, 'PlayerPoisoned')).toMatchObject([{ SourceBombOwnerNetEntityIdRaw: 3, UntilTick: T + 91 }])
    expect([v.toxinUntilTick, v.toxinOwner, v.toxinBomb, v.toxinNextTick]).toEqual([T + 91, 3, b2.id, T + 40])
    const frames = run(w, 70)
    const toxic = evs(frames, 'DamageApplied').filter((e) => e.proto?.Cause === DeathCause.Toxin)
    expect(toxic.map((e) => [e.Tick, e.SourceBombOwnerNetEntityIdRaw])).toEqual([
      [T + 40, 3],
      [T + 60, 3],
      [T + 80, 3],
    ])
    expect(v.toxinUntilTick).toBe(0)
  })

  it('casting bubble cures (PlayerCured before SkillActivated) and no poison ticks follow', () => {
    const { w, v } = statusWorld()
    giveSkill(w, 2, 'bubble', 1)
    addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    step(w)
    run(w, 4)
    const f = step(w, { 2: [SKILL] })
    expect(evs(f, 'PlayerCured')).toEqual([{ type: 'PlayerCured', presentationOnly: true, NetEntityIdRaw: 2, Reason: 'bubble', Tick: w.t }])
    const types = f.events.map((e) => e.type)
    expect(types.indexOf('PlayerCured')).toBeLessThan(types.indexOf('SkillActivated'))
    expect(v.toxinUntilTick).toBe(0)
    expect(evs(run(w, 80), 'DamageApplied')).toHaveLength(0)
    expect(v.health).toBe(4)
  })

  it('a health pack cures (after PickupTaken), even at full health', () => {
    const { w, v } = statusWorld()
    addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    step(w)
    run(w, 4)
    createPickup(w, cell(w, 5, 5), PickupKind.HealthPack, { source: 'crate', droppedBy: 0, fromCell: cell(w, 5, 5) })
    const f = step(w)
    expect(v.health).toBe(6)
    const types = f.events.map((e) => e.type)
    expect(types.indexOf('PickupTaken')).toBeLessThan(types.indexOf('PlayerCured'))
    expect(evs(f, 'PlayerCured')).toMatchObject([{ NetEntityIdRaw: 2, Reason: 'healthPack' }])
    expect(evs(run(w, 80), 'DamageApplied')).toHaveLength(0)

    // 满血中毒：照样能吃血包解毒。
    const { w: w2, v: v2 } = statusWorld()
    addSkillBomb(w2, 1, 5, 5, 1, 2, TOXIN())
    step(w2)
    v2.health = 6
    createPickup(w2, cell(w2, 5, 5), PickupKind.HealthPack, { source: 'crate', droppedBy: 0, fromCell: cell(w2, 5, 5) })
    expect(evs(step(w2), 'PlayerCured')).toHaveLength(1)
    expect(v2.toxinUntilTick).toBe(0)
    // 没中毒、满血：血包留地（原口径）。
    createPickup(w2, cell(w2, 5, 5), PickupKind.HealthPack, { source: 'crate', droppedBy: 0, fromCell: cell(w2, 5, 5) })
    expect(evs(step(w2), 'PickupTaken')).toHaveLength(0)
  })

  it('bubble and respawn protection block the hit and the poison; no poison ticks while bubbled', () => {
    for (const guard of ['bubble', 'protect'] as const) {
      const { w, v } = statusWorld()
      if (guard === 'bubble') v.bubbleUntilTick = w.t + 100
      else v.protectedUntilTick = w.t + 100
      addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
      const f = step(w)
      expect(evs(f, 'DamageApplied'), guard).toHaveLength(0)
      expect(evs(f, 'PlayerPoisoned'), guard).toHaveLength(0)
      expect(v.toxinUntilTick, guard).toBe(0)
    }
    // 中毒后被别处给了泡泡（不是施放，不解毒）：泡泡期内不掉毒血，节拍照走、到期照清。
    const { w, v } = statusWorld()
    addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    step(w)
    const T = w.t
    v.bubbleUntilTick = T + 30
    const frames = run(w, 70)
    expect(evs(frames, 'DamageApplied').map((e) => e.Tick)).toEqual([T + 40, T + 60])
    expect(v.toxinUntilTick).toBe(0)
  })

  it('a killing toxin bomb poisons nobody; death clears poison and shock', () => {
    const { w, v } = statusWorld()
    v.health = 2
    addSkillBomb(w, 1, 5, 5, 1, 2, TOXIN())
    const f = step(w)
    expect(evs(f, 'PlayerDied')).toHaveLength(1)
    expect(evs(f, 'PlayerPoisoned')).toHaveLength(0)

    const { w: w2, v: v2 } = statusWorld()
    addSkillBomb(w2, 1, 5, 3, 1, 2, TOXIN())
    addSkillBomb(w2, 3, 3, 5, 1, 2, SHOCK())
    step(w2)
    expect(v2.toxinUntilTick).toBeGreaterThan(w2.t)
    expect(v2.shockUntilTick).toBeGreaterThan(w2.t)
    addBomb(w2, 1, 5, 7, 1, 2)
    expect(evs(step(w2), 'PlayerDied')).toHaveLength(1)
    step(w2)
    expect([v2.toxinUntilTick, v2.toxinOwner, v2.toxinBomb, v2.toxinNextTick, v2.shockUntilTick, v2.shockSlowPermille]).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('shock bomb', () => {
  it('BOMB with shockBomb L1–L3 places a Shock bomb (BombKind 6) with 40 / 50 / 60 ticks at 300‰', () => {
    for (const [level, ticks] of [
      [1, 40],
      [2, 50],
      [3, 60],
    ] as const) {
      const w = makeWorld()
      put(w, 1, 5, 5)
      put(w, 2, 13, 13)
      giveSkill(w, 1, 'shockBomb', level)
      const f = step(w, { 1: [BOMB] })
      expect(w.bombs[0], `L${level}`).toMatchObject({ kind: BombKind.Shock, shockTicks: ticks, slowPermille: 300, toxinTicks: 0, freezeTicks: 0 })
      expect(f.snapshot.Bombs[0].BomberBombState.BombKind).toBe(6)
    }
  })

  it('damages, then slows the survivor to 300‰: 移速当前 drops (基础 unchanged), movement over 20 ticks = 1050 milli; recovers at T+41', () => {
    const { w, v } = statusWorld()
    const b = addSkillBomb(w, 1, 5, 5, 1, 2, SHOCK())
    const f = step(w)
    const T = w.t
    expect(evs(f, 'DamageApplied')).toMatchObject([{ VictimNetEntityIdRaw: 2, proto: { Points: 2 } }])
    expect(evs(f, 'PlayerShocked')).toEqual([
      { type: 'PlayerShocked', presentationOnly: true, VictimNetEntityIdRaw: 2, SourceBombNetEntityIdRaw: b.id, SourceBombOwnerNetEntityIdRaw: 1, UntilTick: T + 41, Tick: T },
    ])
    const view = f.snapshot.Players.find((p) => p.NetEntityIdRaw === 2)!
    expect(view.玩家属性.移速当前).toBe(1050)
    expect(view.玩家属性基础?.移速基础).toBe(3500)
    expect(view.skills?.shockUntilTick).toBe(T + 41)
    const x0 = v.mx
    run(w, 20, { 2: [mv(方向.右)] })
    expect(v.mx - x0).toBe(1050)
    // T+21..T+40 仍在麻痹；T+41 起恢复。
    const x1 = v.mx
    const frames = run(w, 20, { 2: [mv(方向.右)] })
    expect(v.mx - x1).toBe(1050)
    expect(w.t).toBe(T + 40)
    expect(frames[frames.length - 1].snapshot.Players.find((p) => p.NetEntityIdRaw === 2)!.玩家属性.移速当前).toBe(1050)
    const g = step(w, { 2: [mv(方向.左)] })
    expect(g.snapshot.Players.find((p) => p.NetEntityIdRaw === 2)!.玩家属性.移速当前).toBe(3500)
    const x2 = v.mx
    run(w, 19, { 2: [mv(方向.左)] })
    expect(x2 - v.mx).toBeGreaterThan(3000)
  })

  it('water multiplies with the shock slow (1050 × 700‰ = 735 per second); the snapshot publishes only the shock', () => {
    const { w, v } = statusWorld()
    addSkillBomb(w, 1, 5, 5, 1, 2, SHOCK(200))
    step(w)
    for (let x = 5; x <= 9; x++) setGround(w, x, 5, BlockType.水)
    const x0 = v.mx
    const frames = run(w, 20, { 2: [mv(方向.右)] })
    expect(v.mx - x0).toBe(735)
    expect(frames[frames.length - 1].snapshot.Players.find((p) => p.NetEntityIdRaw === 2)!.玩家属性.移速当前).toBe(1050)
  })

  it('a second hit refreshes (no stacking of the slow); bubble / protection block it', () => {
    const { w, v } = statusWorld()
    addSkillBomb(w, 1, 5, 5, 1, 2, SHOCK())
    step(w)
    const T = w.t
    run(w, 9)
    addSkillBomb(w, 3, 5, 3, 1, 2, SHOCK())
    step(w)
    expect(v.shockUntilTick).toBe(T + 10 + 41)
    expect(v.shockSlowPermille).toBe(300)
    expect(evs(step(w), 'PlayerShocked')).toHaveLength(0)
    for (const guard of ['bubble', 'protect'] as const) {
      const { w: w2, v: v2 } = statusWorld()
      if (guard === 'bubble') v2.bubbleUntilTick = w2.t + 100
      else v2.protectedUntilTick = w2.t + 100
      addSkillBomb(w2, 1, 5, 5, 1, 2, SHOCK())
      expect(evs(step(w2), 'PlayerShocked'), guard).toHaveLength(0)
      expect(v2.shockUntilTick, guard).toBe(0)
    }
  })

  it('casting bubble does not cure shock', () => {
    const { w, v } = statusWorld()
    giveSkill(w, 2, 'bubble', 1)
    addSkillBomb(w, 1, 5, 5, 1, 2, SHOCK())
    step(w)
    const until = v.shockUntilTick
    const f = step(w, { 2: [SKILL] })
    expect(evs(f, 'SkillActivated')).toHaveLength(1)
    expect(evs(f, 'PlayerCured')).toHaveLength(0)
    expect(v.shockUntilTick).toBe(until)
  })
})
