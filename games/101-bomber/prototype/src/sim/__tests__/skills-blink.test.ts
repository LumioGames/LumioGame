import { describe, expect, it } from 'vitest'
import { BlockType, PickupKind, 方向 } from '../../contract'
import { startMatch } from '../match-phase'
import { addBomb, evs, makeWorld, mv, player, put, setBrick, setGround, SKILL, step } from './helpers'
import { face, giveSkill, putCandy, putChest } from './skill-helpers'

/** 闪现（原型扩展 NON-CONTRACT，ADR 0030，D12）：朝面向落到最远的空格，越过砖 / 炸弹 / 宝箱，铁皮与边界截断。 */

function catAt(x: number, y: number, dir: 方向) {
  const w = makeWorld({ picks: ['cat', null] })
  const cat = put(w, 1, x, y)
  put(w, 2, 17, 17)
  face(w, 1, dir)
  return { w, cat }
}

const blink = (w: ReturnType<typeof makeWorld>) => step(w, { 1: [SKILL] })

describe('facing', () => {
  it('defaults to 下 at match start, follows a blocked non-stop input, survives release', () => {
    const w = makeWorld({ picks: ['cat', null] })
    startMatch(w, 1)
    expect(player(w, 1).facing).toBe(方向.下)
    const { w: w2, cat } = catAt(1, 1, 方向.下)
    setBrick(w2, 2, 1, BlockType.积木)
    step(w2, { 1: [mv(方向.右)] })
    expect(cat.facing).toBe(方向.右)
    expect(cat.mx).toBe(1500)
    step(w2, { 1: [mv(方向.停)] })
    expect(cat.facing).toBe(方向.右)
  })
})

describe('blink', () => {
  it('from (5,5) facing 右 lands on (8,5); resets only in-flight movement; keeps the water counter', () => {
    const { w, cat } = catAt(5, 5, 方向.右)
    cat.moveAcc = 7
    cat.lastDir = 方向.右
    cat.turnBuf = 3
    cat.pendingDir = 方向.上
    // 起点与落点都是水：溺水计数接着数（闪现不调用 resetAbilityFields）。
    setGround(w, 5, 5, BlockType.水)
    setGround(w, 8, 5, BlockType.水)
    cat.waterTicks = 4
    const f = blink(w)
    const T = w.t
    expect([cat.mx, cat.my]).toEqual([8500, 5500])
    expect(cat.teleportTick).toBe(T)
    expect(cat.blinkTick).toBe(T)
    expect([cat.moveAcc, cat.lastDir, cat.turnBuf, cat.pendingDir]).toEqual([0, 方向.停, 0, 方向.停])
    expect(cat.waterTicks).toBe(5)
    expect(evs(f, 'SkillActivated')).toMatchObject([{ Skill: 'blink', Level: 1, Cell: { X: 5, Y: 5 }, ToCell: { X: 8, Y: 5 }, UntilTick: 0, CdUntilTick: T + 240 }])
    expect(f.snapshot.Players[0].skills?.blinkTick).toBe(T)
  })

  it('passes over a soft brick, a bomb and a chest', () => {
    const { w, cat } = catAt(5, 5, 方向.右)
    setBrick(w, 6, 5, BlockType.积木)
    addBomb(w, 2, 7, 5, 40)
    blink(w)
    expect(cat.mx).toBe(8500)

    const { w: w2, cat: c2 } = catAt(5, 5, 方向.右)
    putChest(w2, 7, 5)
    blink(w2)
    expect(c2.mx).toBe(8500)
  })

  it('a blocked farthest cell (soft brick, bomb or chest) falls back to the farthest free one', () => {
    for (const block of ['brick', 'bomb', 'chest'] as const) {
      const { w, cat } = catAt(5, 5, 方向.右)
      if (block === 'brick') setBrick(w, 8, 5, BlockType.木箱)
      else if (block === 'bomb') addBomb(w, 2, 8, 5, 40)
      else putChest(w, 8, 5)
      blink(w)
      expect(cat.mx, block).toBe(7500)
    }
  })

  it('iron truncates the scan', () => {
    const { w, cat } = catAt(3, 5, 方向.右)
    setBrick(w, 6, 5, BlockType.铁皮)
    blink(w)
    expect(cat.mx).toBe(5500)
  })

  it('no landing (iron right ahead, or the border) → SkillFailed(noLanding), no CD, no movement', () => {
    for (const [x, y, dir] of [
      [5, 5, 方向.下],
      [1, 5, 方向.左],
    ] as const) {
      const { w, cat } = catAt(x, y, dir)
      if (x === 5) setBrick(w, 5, 6, BlockType.铁皮)
      const f = blink(w)
      expect(evs(f, 'SkillFailed')).toMatchObject([{ Skill: 'blink', Reason: 'noLanding' }])
      expect(cat.cdUntilTick).toBe(0)
      expect([cat.mx, cat.my]).toEqual([x * 1000 + 500, y * 1000 + 500])
      expect(cat.blinkTick).toBe(0)
    }
    // (6,5) 朝下：(6,6) 是铁皮柱。
    const { w, cat } = catAt(6, 5, 方向.下)
    expect(evs(blink(w), 'SkillFailed')).toMatchObject([{ Reason: 'noLanding' }])
    expect(cat.my).toBe(5500)
  })

  it('cat L3 reaches 4 cells', () => {
    const { w, cat } = catAt(5, 5, 方向.右)
    giveSkill(w, 1, 'blink', 3, true)
    blink(w)
    expect(cat.mx).toBe(9500)
    expect(cat.cdUntilTick).toBe(w.t + 160)
  })

  it('a candy on the landing cell is picked up the same tick', () => {
    const { w, cat } = catAt(5, 5, 方向.右)
    putCandy(w, 8, 5, 'kick')
    const f = blink(w)
    expect(evs(f, 'PickupTaken')).toMatchObject([{ PickerNetEntityIdRaw: 1, Kind: PickupKind.SkillCandy, proto: { Skill: 'kick', SkillLevel: 1 } }])
    expect(cat.slots.passive).toEqual({ skill: 'kick', level: 1, bound: false, parts: null })
  })

  it('blinking from off-centre scans from the player cell', () => {
    const { w, cat } = catAt(5, 5, 方向.右)
    cat.mx = 5700
    blink(w)
    expect([cat.mx, cat.my]).toEqual([8500, 5500])
  })
})
