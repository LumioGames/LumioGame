import { describe, expect, it } from 'vitest'
import { BlockType, BombKind, DeathCause } from '../../contract'
import { addBomb, BOMB, evs, makeWorld, player, put, run, setGround, SKILL, startCircle, step } from './helpers'
import { addSkillBomb, giveSkill } from './skill-helpers'

/** 泡泡 / 弹射泡泡（原型扩展 NON-CONTRACT，ADR 0030，D11）：期内不受炸弹 / 烧伤 / 冻结 / 溺水伤害、不能放弹；毒照扣。 */

function duckWorld() {
  const w = makeWorld({ picks: ['duck', 'bear'] })
  const duck = put(w, 1, 5, 5)
  put(w, 2, 13, 13)
  return { w, duck }
}

describe('bubble', () => {
  it('a bomb inside the window neither hurts nor records a hit; a fresh bomb after the window hurts', () => {
    const { w, duck } = duckWorld()
    step(w, { 1: [SKILL] })
    const T = w.t
    const b = addBomb(w, 2, 5, 3, 1, 3)
    const f = step(w)
    expect(evs(f, 'DamageApplied')).toHaveLength(0)
    expect(b.hit).not.toContain(1)
    expect(w.chainDmg.get(b.chainId)?.get(1)).toBeUndefined()
    expect(duck.health).toBe(w.cfg.maxHealthPoints)
    run(w, T + 60 - w.t)
    expect(w.t).toBe(T + 60)
    addBomb(w, 2, 5, 3, 1, 3)
    const g = step(w)
    expect(evs(g, 'DamageApplied')).toMatchObject([{ VictimNetEntityIdRaw: 1 }])
  })

  it('flames still burning when the bubble ends hurt on the first tick after it', () => {
    const { w, duck } = duckWorld()
    step(w, { 1: [SKILL] })
    const T = w.t
    run(w, 60 - 3)
    addBomb(w, 2, 5, 3, 1, 3)
    const frames = run(w, 4)
    const dmg = evs(frames, 'DamageApplied')
    expect(dmg).toHaveLength(1)
    expect(dmg[0].Tick).toBe(T + 60)
    expect(duck.health).toBe(w.cfg.maxHealthPoints - w.rules.bombDamagePoints)
  })

  it('bomb key while bubbled places nothing, keeps capacity and the bubble, and clears the buffer', () => {
    const { w, duck } = duckWorld()
    step(w, { 1: [SKILL] })
    const until = duck.bubbleUntilTick
    const f = step(w, { 1: [BOMB] })
    expect(evs(f, 'BombPlaced')).toHaveLength(0)
    expect(w.bombs).toHaveLength(0)
    expect(duck.capacity).toBe(w.cfg.initialBombCapacity)
    expect(duck.bubbleUntilTick).toBe(until)
    expect(duck.bombBufUntil).toBe(0)
  })

  it('a press buffered the tick before the cast never fires during the bubble', () => {
    const { w, duck } = duckWorld()
    duck.capacity = 0
    step(w, { 1: [BOMB] })
    expect(duck.bombBufUntil).toBeGreaterThan(w.t)
    step(w, { 1: [SKILL] })
    duck.capacity = 1
    const frames = run(w, 5)
    expect(evs(frames, 'BombPlaced')).toHaveLength(0)
    expect(duck.bombBufUntil).toBe(0)
  })

  it('blocks drowning but not poison', () => {
    const { w, duck } = duckWorld()
    setGround(w, 5, 5, BlockType.水)
    step(w, { 1: [SKILL] })
    const frames = run(w, 50)
    expect(evs(frames, 'DamageApplied')).toHaveLength(0)
    expect(duck.waterTicks).toBe(51)

    const w2 = makeWorld({ picks: ['duck', null], rules: { poisonIntervalMs: 1000 } })
    const d2 = put(w2, 1, 1, 1)
    put(w2, 2, 9, 9)
    startCircle(w2)
    // 直接把安全圈缩到中心，(1,1) 在圈外；泡泡 60 Tick 覆盖整个观察窗口。
    w2.finalCircle!.ring = { min: 8, max: 10 }
    step(w2, { 1: [SKILL] })
    const pf = run(w2, 45)
    const poison = evs(pf, 'DamageApplied').filter((e) => e.proto?.Cause === DeathCause.Poison)
    expect(poison.length).toBeGreaterThanOrEqual(2)
    expect(poison.every((e) => e.VictimNetEntityIdRaw === 1)).toBe(true)
    expect(d2.bubbleUntilTick).toBeGreaterThan(poison[poison.length - 1].Tick)
  })

  it('blocks aura burn and freeze', () => {
    const w = makeWorld({ picks: ['duck', 'bear'] })
    const duck = put(w, 1, 5, 5)
    put(w, 2, 5, 3)
    step(w, { 1: [SKILL] })
    step(w, { 2: [SKILL] })
    // 熊从 (5,3) 挪到 (5,4)：鸭所在的 (5,5) 落进光环 3×3，但泡泡期内不烧。
    put(w, 2, 5, 4)
    const frames = run(w, 10)
    expect(evs(frames, 'DamageApplied')).toHaveLength(0)
    addSkillBomb(w, 2, 5, 3, 1, 3, { kind: BombKind.Freeze, freezeTicks: 16 })
    const f = step(w)
    expect(evs(f, 'PlayerFrozen').filter((e) => e.VictimNetEntityIdRaw === 1)).toHaveLength(0)
    expect(evs(f, 'DamageApplied').filter((e) => e.VictimNetEntityIdRaw === 1)).toHaveLength(0)
    expect(duck.frozenUntilTick).toBe(0)
  })

  it('bounceBubble also blocks bomb placement and damage', () => {
    const w = makeWorld({ picks: ['duck', null] })
    const duck = put(w, 1, 5, 5)
    put(w, 2, 13, 13)
    giveSkill(w, 1, 'bounceBubble', 1, true, [
      { skill: 'bubble', level: 1, bound: true },
      { skill: 'kick', level: 1, bound: false },
    ])
    const f = step(w, { 1: [SKILL] })
    expect(evs(f, 'SkillActivated')).toMatchObject([{ Skill: 'bounceBubble', UntilTick: w.t + 60, CdUntilTick: w.t + 360 }])
    expect(evs(step(w, { 1: [BOMB] }), 'BombPlaced')).toHaveLength(0)
    addBomb(w, 2, 5, 3, 1)
    expect(evs(step(w), 'DamageApplied')).toHaveLength(0)
    expect(player(w, 1).health).toBe(w.cfg.maxHealthPoints)
    expect(duck.bubbleUntilTick).toBeGreaterThan(w.t)
  })
})
