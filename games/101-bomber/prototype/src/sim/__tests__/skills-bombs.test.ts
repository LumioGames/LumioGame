import { describe, expect, it } from 'vitest'
import { BlockType, BombKind, 方向 } from '../../contract'
import { PIERCE_BOMB, PIERCE_CASES, parsePierceBoard, referenceCross } from '../../../tests/support/pierce-cases'
import { computeDangerCells, crossCells } from '../explosion'
import { addBomb, BOMB, cell, evs, makeWorld, mv, player, put, setBrick, setGround, SKILL, step } from './helpers'
import { addSkillBomb, giveSkill, putChest } from './skill-helpers'

/**
 * 炸弹槽技能（原型扩展 NON-CONTRACT，ADR 0030，design §8.4）：冰冻弹（Q1：照常扣血再冻住幸存者）、穿透弹（唯一口径，
 * contract/skills.ts 文件头 + tests/support/pierce-cases.ts）、冰川弹；crossCells 与真实爆炸同步。
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
