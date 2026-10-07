import { describe, expect, it } from 'vitest'
import { 方向 } from '../../contract'
import { startMatch } from '../match-phase'
import { addBomb, BOMB, evs, makeWorld, player, put, run, SKILL, step } from './helpers'
import { face, giveSkill, putCandy } from './skill-helpers'

/** 主动槽施放（原型扩展 NON-CONTRACT，ADR 0030，design §8.1 / §8.4）：冷却、失败原因、冻结门、死亡与开局。 */

const cast = (w: ReturnType<typeof makeWorld>, id = 1) => step(w, { [id]: [SKILL] })

describe('activation and cooldown', () => {
  it('an empty active slot fails with noSkill: no bomb, no CD', () => {
    const w = makeWorld()
    put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    const f = cast(w)
    expect(evs(f, 'SkillFailed')).toMatchObject([{ PlayerNetEntityIdRaw: 1, Skill: null, Reason: 'noSkill', Tick: w.t }])
    expect(evs(f, 'BombPlaced')).toHaveLength(0)
    expect(player(w, 1).cdUntilTick).toBe(0)
  })

  it('duck bubble L1: CD / duration from the tick table, SkillActivated fields, cooldown failure, ready again at T+CD', () => {
    const w = makeWorld({ picks: ['duck', null] })
    // 泡泡 L1 读配表（第 4 轮平衡后 3.5 s / 14 s，ADR 0034），换算见 data-model「tick table」。
    const { cd: CD, duration: DUR } = w.ticks.skills.bubble[0]
    expect(CD).toBeGreaterThan(100 + DUR)
    const p = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    const f = cast(w)
    const T = w.t
    expect(p.cdFromTick).toBe(T)
    expect(p.cdUntilTick).toBe(T + CD)
    expect(p.bubbleUntilTick).toBe(T + DUR)
    expect(evs(f, 'SkillActivated')).toEqual([
      {
        type: 'SkillActivated',
        presentationOnly: true,
        PlayerNetEntityIdRaw: 1,
        Skill: 'bubble',
        Level: 1,
        Cell: { X: 5, Y: 5 },
        ToCell: { X: 5, Y: 5 },
        UntilTick: T + DUR,
        CdUntilTick: T + CD,
        Tick: T,
      },
    ])
    run(w, 99)
    const g = cast(w)
    expect(w.t).toBe(T + 100)
    expect(evs(g, 'SkillFailed')).toMatchObject([{ Skill: 'bubble', Reason: 'cooldown' }])
    expect(evs(g, 'SkillActivated')).toHaveLength(0)
    expect(p.cdUntilTick).toBe(T + CD)
    expect(p.bubbleUntilTick).toBe(T + DUR)
    run(w, CD - 102)
    expect(evs(cast(w), 'SkillFailed')).toMatchObject([{ Reason: 'cooldown' }])
    expect(w.t).toBe(T + CD - 1)
    expect(evs(cast(w), 'SkillActivated')).toHaveLength(1)
    expect(p.cdUntilTick).toBe(T + CD + CD)
  })

  it('per-level CD: bubble L2 / L3 use their own rows (CD shorter, duration longer than L1)', () => {
    const rows = makeWorld().ticks.skills.bubble
    for (const level of [2, 3] as const) {
      const { cd, duration: dur } = rows[level - 1]
      expect(cd).toBeLessThan(rows[level - 2].cd)
      expect(dur).toBeGreaterThan(rows[level - 2].duration)
      const w = makeWorld({ picks: ['duck', null] })
      put(w, 1, 5, 5)
      put(w, 2, 13, 13)
      giveSkill(w, 1, 'bubble', level, true)
      cast(w)
      expect(player(w, 1).cdUntilTick - w.t).toBe(cd)
      expect(player(w, 1).bubbleUntilTick - w.t).toBe(dur)
    }
  })

  it('a frozen player pressing the skill key gets SkillFailed(frozen), no CD, no bomb', () => {
    const w = makeWorld({ picks: ['duck', null] })
    const p = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    p.frozenUntilTick = w.t + 5
    const f = step(w, { 1: [SKILL, BOMB] })
    expect(evs(f, 'SkillFailed')).toMatchObject([{ Skill: 'bubble', Reason: 'frozen' }])
    expect(p.cdUntilTick).toBe(0)
    expect(p.bubbleUntilTick).toBe(0)
    expect(w.bombs).toHaveLength(0)
  })
})

describe('death, respawn and the next match', () => {
  it('death zeroes bubble / aura on the processDeaths tick; CD survives death and respawn', () => {
    const w = makeWorld({ picks: ['bear', null] })
    const p = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    cast(w)
    const cd = p.cdUntilTick
    expect(p.auraUntilTick).toBeGreaterThan(w.t)
    p.health = 2
    addBomb(w, 2, 5, 5, 1)
    step(w)
    expect(p.health).toBe(0)
    expect(p.auraUntilTick).toBeGreaterThan(w.t)
    step(w)
    expect(p.auraUntilTick).toBe(0)
    expect(p.bubbleUntilTick).toBe(0)
    run(w, w.ticks.respawn + 2)
    expect(p.health).toBe(w.cfg.maxHealthPoints)
    expect(p.cdUntilTick).toBe(cd)
    expect(p.slots.active).toEqual({ skill: 'fireAura', level: 1, bound: true, parts: null })
  })

  it('startMatch clears the CD and restores only the exclusive skill at Lv1', () => {
    const w = makeWorld({ picks: ['cat', null] })
    const p = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    giveSkill(w, 1, 'blink', 3, true)
    giveSkill(w, 1, 'kick', 2)
    giveSkill(w, 1, 'glacierBomb', 1, false, [
      { skill: 'freezeBomb', level: 1, bound: false },
      { skill: 'pierceBomb', level: 1, bound: false },
    ])
    face(w, 1, 方向.右)
    cast(w)
    expect(p.cdUntilTick).toBeGreaterThan(0)
    startMatch(w, 1)
    expect(p.cdUntilTick).toBe(0)
    expect(p.cdFromTick).toBe(0)
    expect(p.blinkTick).toBe(0)
    expect(p.slots).toEqual({ bomb: null, active: { skill: 'blink', level: 1, bound: true, parts: null }, passive: null })
  })

  it('evolving keeps the CD: cat blinks, then picks fireAura → fireDash with the same cdUntilTick', () => {
    const w = makeWorld({ picks: ['cat', null] })
    const p = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    face(w, 1, 方向.右)
    cast(w)
    expect(p.mx).toBe(8500)
    const cd = p.cdUntilTick
    putCandy(w, 8, 5, 'fireAura')
    const f = step(w)
    expect(evs(f, 'SkillEvolved')).toHaveLength(1)
    expect(p.slots.active?.skill).toBe('fireDash')
    expect(p.cdUntilTick).toBe(cd)
    expect(evs(cast(w), 'SkillFailed')).toMatchObject([{ Skill: 'fireDash', Reason: 'cooldown' }])
  })
})

describe('offensive casts end respawn protection (SkillDef.endsProtection)', () => {
  it('fireAura and fireDash end it; bubble and blink keep it', () => {
    const cases = [
      ['bear', null, true],
      ['cat', 'fireDash', true],
      ['duck', null, false],
      ['cat', null, false],
    ] as const
    for (const [pick, override, ends] of cases) {
      const w = makeWorld({ picks: [pick, null] })
      const p = put(w, 1, 5, 5)
      put(w, 2, 13, 13)
      if (override) giveSkill(w, 1, override, 1, true, [
        { skill: 'blink', level: 1, bound: true },
        { skill: 'fireAura', level: 1, bound: false },
      ])
      face(w, 1, 方向.右)
      p.protectedUntilTick = w.t + 50
      const f = cast(w)
      expect(evs(f, 'SkillActivated'), `${pick}/${override}`).toHaveLength(1)
      if (ends) expect(p.protectedUntilTick, `${pick}/${override}`).toBe(w.t)
      else expect(p.protectedUntilTick, `${pick}/${override}`).toBe(w.t + 49)
    }
  })
})
