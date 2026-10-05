import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, type SkillId, type SkillSlot } from '../../contract'
import { resolveSkillPickup, type SkillHolding, type SkillSlots } from '../skill-rules'

/** D6 / D16：吃技能糖——升级、进化、装上或拒收。 */
const R = DEFAULT_RULES

function slots(p: Partial<Record<SkillSlot, [SkillId, number, boolean?]>>): SkillSlots {
  const h = (v?: [SkillId, number, boolean?]): SkillHolding | null => (v ? { skill: v[0], level: v[1], bound: v[2] ?? false } : null)
  return { bomb: h(p.bomb), active: h(p.active), passive: h(p.passive) }
}
const candy = (skill: SkillId, level = 1) => ({ skill, level })

describe('resolveSkillPickup', () => {
  it('empty slot → equip at the candy level', () => {
    expect(resolveSkillPickup(R, slots({}), candy('kick', 2))).toEqual({ kind: 'equip', slot: 'passive', level: 2 })
    expect(resolveSkillPickup(R, slots({}), candy('freezeBomb'))).toEqual({ kind: 'equip', slot: 'bomb', level: 1 })
  })

  it('same skill levels up by one (the candy level is ignored); max level rejects', () => {
    expect(resolveSkillPickup(R, slots({ passive: ['kick', 1] }), candy('kick', 3))).toEqual({ kind: 'levelUp', slot: 'passive', level: 2 })
    expect(resolveSkillPickup(R, slots({ passive: ['kick', 3] }), candy('kick'))).toEqual({ kind: 'reject', reason: 'maxLevel' })
  })

  it('an exclusive skill levels up the same way (cat + blink candy)', () => {
    expect(resolveSkillPickup(R, slots({ active: ['blink', 1, true] }), candy('blink'))).toEqual({ kind: 'levelUp', slot: 'active', level: 2 })
  })

  it('cat + fire aura candy → fire dash in place, bound part kept', () => {
    const out = resolveSkillPickup(R, slots({ active: ['blink', 2, true] }), candy('fireAura'))
    expect(out).toEqual({
      kind: 'evolve',
      combo: 'fireDash',
      slot: 'active',
      freed: null,
      parts: [
        { skill: 'blink', level: 2, bound: true },
        { skill: 'fireAura', level: 1, bound: false },
      ],
    })
  })

  it('bear + blink candy → fire dash', () => {
    const out = resolveSkillPickup(R, slots({ active: ['fireAura', 1, true] }), candy('blink'))
    expect(out).toMatchObject({ kind: 'evolve', combo: 'fireDash', slot: 'active', freed: null })
  })

  it('duck + kick candy → bounce bubble in the active slot, nothing freed', () => {
    const out = resolveSkillPickup(R, slots({ active: ['bubble', 1, true] }), candy('kick'))
    expect(out).toMatchObject({ kind: 'evolve', combo: 'bounceBubble', slot: 'active', freed: null })
  })

  it('kick in passive + bubble candy with the active slot empty → bounce bubble, passive freed', () => {
    const out = resolveSkillPickup(R, slots({ passive: ['kick', 2] }), candy('bubble'))
    expect(out).toMatchObject({ kind: 'evolve', combo: 'bounceBubble', slot: 'active', freed: 'passive' })
  })

  it('same, but the active slot holds a bound blink → slot taken', () => {
    const out = resolveSkillPickup(R, slots({ passive: ['kick', 2], active: ['blink', 1, true] }), candy('bubble'))
    expect(out).toEqual({ kind: 'reject', reason: 'slotTaken' })
  })

  it('freeze + pierce → glacier bomb', () => {
    expect(resolveSkillPickup(R, slots({ bomb: ['freezeBomb', 3] }), candy('pierceBomb'))).toMatchObject({
      kind: 'evolve',
      combo: 'glacierBomb',
      slot: 'bomb',
      freed: null,
    })
  })

  it('rejections: a combo cannot level up; rabbit cannot take kick; duck cannot take blink', () => {
    expect(resolveSkillPickup(R, slots({ active: ['fireDash', 1, true] }), candy('blink'))).toEqual({ kind: 'reject', reason: 'slotTaken' })
    expect(resolveSkillPickup(R, slots({ active: ['fireDash', 1, true] }), candy('fireDash'))).toEqual({ kind: 'reject', reason: 'comboNoLevels' })
    expect(resolveSkillPickup(R, slots({ passive: ['regen', 1, true] }), candy('kick'))).toEqual({ kind: 'reject', reason: 'slotTaken' })
    expect(resolveSkillPickup(R, slots({ active: ['bubble', 1, true] }), candy('blink'))).toEqual({ kind: 'reject', reason: 'slotTaken' })
  })

  it('a held combo is never an evolution ingredient', () => {
    // 弹射泡泡已在主动槽：再吃踢弹糖不会拿组合技去进化，被动槽空 → 装上。
    expect(resolveSkillPickup(R, slots({ active: ['bounceBubble', 1] }), candy('kick'))).toEqual({ kind: 'equip', slot: 'passive', level: 1 })
  })

  it('combo candy into an empty slot equips at level 1', () => {
    expect(resolveSkillPickup(R, slots({}), candy('glacierBomb', 2))).toEqual({ kind: 'equip', slot: 'bomb', level: 1 })
  })
})
