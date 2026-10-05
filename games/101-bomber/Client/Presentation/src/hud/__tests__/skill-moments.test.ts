import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../../contract'
import { blockedCandyText, bombPickupText, burnSourceAt, burnSourceName, curedText, diffSkills, poisonedText, shockedText, skillFailText } from '../skill-moments'
import { held, skillsView, snap } from './fixtures'

const R = DEFAULT_RULES

describe('two-chip bomb notices', () => {
  it('ignores initial snapshots, levels, same-kind pickups, other slots and removals', () => {
    const empty = skillsView()
    const freeze = skillsView({ slots: { bomb: held('freezeBomb'), active: null, passive: null } })
    expect(diffSkills(undefined, freeze, R)).toEqual([])
    expect(diffSkills(empty, freeze, R)).toEqual([{ kind: 'equip', skill: 'freezeBomb' }])
    expect(diffSkills(freeze, skillsView({ slots: { ...freeze.slots, bomb: held('freezeBomb', 3), active: held('blink') } }), R)).toEqual([])
    expect(diffSkills(freeze, empty, R)).toEqual([])
  })

  it('reports form replacement and hides unsupported legacy identities', () => {
    const freeze = skillsView({ slots: { bomb: held('freezeBomb'), active: null, passive: null } })
    expect(diffSkills(freeze, skillsView({ slots: { ...freeze.slots, bomb: held('pierceBomb') } }), R)).toEqual([{ kind: 'replace', skill: 'pierceBomb' }])
    expect(diffSkills(freeze, skillsView({ slots: { ...freeze.slots, bomb: held('glacierBomb') } }), R)).toEqual([])
    expect(diffSkills(freeze, skillsView({ slots: { ...freeze.slots, bomb: held('fireBomb') } }), R)).toEqual([{ kind: 'replace', skill: 'fireBomb' }])
  })

  it('uses a fixed level-one bomb name and description', () => {
    expect(bombPickupText('freezeBomb', R, 2)).toContain('冰冻弹 · 炸到的对手还会被冻住')
    expect(bombPickupText('freezeBomb', R, 2)).not.toContain('Lv')
  })

  it('same-kind standing hint is read-only and has no upgrade text', () => {
    const slots = { bomb: held('freezeBomb', 3), active: held('blink', 1, true), passive: null }
    expect(blockedCandyText(slots, { skill: 'freezeBomb', level: 1 }, R)).toBe('已经装备 冰冻弹')
    expect(blockedCandyText(slots, { skill: 'pierceBomb', level: 1 }, R)).toBeNull()
  })
})

describe('status and skill feedback', () => {
  it('keeps passive and active failure guidance', () => {
    expect(skillFailText('noSkill', null, 0, 'rabbit', R)).toBe('回春是被动技能，自动生效')
    expect(skillFailText('cooldown', 'flyKick', 2.3, 'kangaroo', R)).toBe('飞踢 冷却中 · 2.3 秒')
    expect(skillFailText('noLanding', 'flyKick', 0, 'kangaroo', R)).toBe('面前没有能踢的炸弹')
    expect(skillFailText('frozen', 'blink', 0, 'cat', R)).toBe('被冻住了，放不了技能')
  })

  it('finds the owner fire source', () => {
    const s = snap({ tick: 1, fireZones: [{ owner: 4, source: 'aura', cells: [{ X: 2, Y: 2 }], untilTick: 90 }] })
    expect(burnSourceAt(s, 4, { X: 2, Y: 2 })).toBe('aura')
    expect(burnSourceAt(s, 3, { X: 2, Y: 2 })).toBeNull()
    expect([burnSourceName('aura'), burnSourceName('firewall'), burnSourceName(null)]).toEqual(['火焰光环', '火墙', '火'])
  })

  it('keeps poison, shock and cure notices', () => {
    expect(poisonedText({ name: '豆豆熊' }, 3)).toContain('掉血 3 秒')
    expect(shockedText('self', 2.5)).toContain('2.5 秒')
    expect(curedText('bubble')).toBe('泡泡解毒了')
  })
})
